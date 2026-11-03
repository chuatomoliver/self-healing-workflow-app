import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildApp } from '../src/app.ts'
import { ApiError } from '../src/errors.ts'
import { createMusePreparer } from '../src/muse/preparation.ts'
import { loadConnections, parseConnections, validateConnectionBindings } from '../src/webhooks/connections.ts'
import type { WorkflowRepository } from '../src/workflows/repository.ts'
import type { WorkflowDraft } from '../../shared/workflows.ts'
import { workflowSetupSummary, webhookSetupIssues } from '../../shared/setup.ts'
import { connectionSummaries } from '../../shared/connections.ts'
import { supportConnection, preparationFixture } from './preparation-fixture.ts'

const noStorage = async (): Promise<never> => { assert.fail('Preparing must not access workflow storage') }
const repository: WorkflowRepository = { health: noStorage, list: noStorage, get: noStorage, create: noStorage, update: noStorage }
const payload = { prompt: 'Given a support request, POST its subject to the saved Support notifications connection.' }

test('one prompt prepares graph, operations, and saved webhook setup without per-step manual review or storage', async (t) => {
  let calls = 0
  const app = buildApp({ repository, connections: async () => [supportConnection], hasWebhookCredential: async (ref) => ref === 'support_token', prepare: async (input, _signal, catalog) => {
    calls++; assert.equal(input.prompt, payload.prompt)
    assert.deepEqual(catalog, connectionSummaries([supportConnection]))
    assert.ok(!JSON.stringify(catalog).includes('support_token'))
    return preparationFixture()
  } }); t.after(() => app.close())
  const response = await app.inject({ method: 'POST', url: '/api/prepare', payload })
  assert.equal(response.statusCode, 200, response.body)
  const { draft } = response.json<{ draft: WorkflowDraft }>()
  assert.equal(draft.plan.configurationMode, 'automatic')
  assert.equal(draft.plan.steps[0].configuredBy, 'muse')
  assert.equal(draft.plan.steps.some((step) => step.reviewed), false)
  assert.equal(draft.plan.steps.some((step) => step.configuration.some((setting) => setting.label === 'Operation setup')), false)
  const hook = draft.plan.webhooks[0]
  assert.equal(hook.endpoint.urlTemplate, supportConnection.endpointUrl)
  assert.equal(hook.authentication.secretRef, 'support_token')
  assert.equal(hook.connectionId, 'support'); assert.equal(hook.configuredBy, 'muse')
  assert.deepEqual(hook.setup, { endpointReviewed: false, authenticationReviewed: false, payloadReviewed: false })
  assert.deepEqual(webhookSetupIssues(hook), [])
  assert.deepEqual(draft.plan.steps[1].mappings, [{ source: 'request.subject', target: 'webhook.payload.subject' }])
  const summary = workflowSetupSummary({ ...draft.plan, structureReviewed: true })
  assert.equal(summary.reviewedSteps, 0); assert.equal(summary.configuredSteps, 2); assert.equal(summary.complete, true)
  assert.equal(draft.plan.checks.find((check) => check.id === 'execution')?.status, 'not-run')
  assert.equal(calls, 1)
  const publicCatalog = await app.inject('/api/connections')
  assert.deepEqual(publicCatalog.json(), { connections: connectionSummaries([supportConnection]) })
  assert.ok(!publicCatalog.body.includes('endpointUrl'))
})

test('missing connections, missing credentials, and unknown rules stay unresolved', async (t) => {
  for (const mode of ['connection', 'credential', 'rule'] as const) {
    const output = preparationFixture()
    if (mode === 'connection') output.plan.webhookBindings![0].connectionId = ''
    if (mode === 'rule') {
      output.plan.steps[1].configuration = [{ label: 'Priority rule', value: '', needsInput: true }]
      output.plan.questions = [{ id: 'priority', stepId: 'send', question: 'What is the priority rule?', explanation: 'Not specified.' }]
    }
    const app = buildApp({ repository, connections: async () => mode === 'connection' ? [] : [supportConnection], hasWebhookCredential: async () => mode !== 'credential', prepare: async () => output })
    t.after(() => app.close())
    const response = await app.inject({ method: 'POST', url: '/api/prepare', payload })
    assert.equal(response.statusCode, 200, response.body)
    const draft = response.json().draft as WorkflowDraft
    assert.equal(workflowSetupSummary({ ...draft.plan, structureReviewed: true }).complete, false)
    assert.equal(draft.plan.questions.length > 0, mode === 'rule')
    if (mode !== 'rule') assert.equal(draft.plan.webhooks[0].configuredBy, undefined)
    if (mode === 'connection') assert.match(draft.plan.webhooks[0].endpoint.urlTemplate, /\.invalid/)
    if (mode === 'connection') assert.equal(draft.plan.webhooks[0].availability, 'connection-needed')
    if (mode === 'credential') assert.equal(draft.plan.webhooks[0].availability, 'credential-needed')
  }
})

test('n8n webhook requirements can be identified and saved before any n8n setup, with business questions kept separate', async (t) => {
  const output = preparationFixture()
  const hook = output.extraction.webhooks[0]
  hook.name = 'n8n purchase review'
  hook.purpose = 'Pass the purchase request to the downstream n8n workflow.'
  hook.suggestionReason = 'The requested handoff needs an outgoing webhook that starts the n8n workflow.'
  output.extraction.nodes[1].app = 'n8n'
  output.plan.webhookBindings = [{ webhookId: hook.id, connectionId: '' }]
  output.plan.questions = []
  let stored = 0
  const app = buildApp({ repository: { ...repository, create: async (draft) => { stored++; return { ...draft, id: '4bf72532-826c-4354-8bfc-dfb83f299094', version: 1, createdAt: '', updatedAt: '' } } },
    connections: async () => [supportConnection], prepare: async () => output,
  }); t.after(() => app.close())
  const response = await app.inject({ method: 'POST', url: '/api/prepare', payload: { prompt: 'Send the request to n8n to start its downstream automation. Identify the necessary webhook; n8n is not connected.' } })
  assert.equal(response.statusCode, 200, response.body)
  const draft = response.json().draft as WorkflowDraft
  assert.equal(stored, 0)
  assert.equal(draft.plan.webhooks[0].name, 'n8n purchase review')
  assert.equal(draft.plan.webhooks[0].availability, 'connection-needed')
  assert.equal(draft.plan.webhooks[0].connectionId, undefined)
  assert.deepEqual(draft.plan.webhooks[0].payloadTemplate, { subject: '{{request.subject}}' })
  assert.equal(draft.plan.questions.length, 0)
  assert.equal(workflowSetupSummary({ ...draft.plan, structureReviewed: true }).complete, false)
  assert.equal((await app.inject({ method: 'POST', url: '/api/workflows', payload: draft })).statusCode, 201)
  assert.equal(stored, 1)
  Object.assign(draft.plan.webhooks[0], { availability: 'ready' })
  assert.equal((await app.inject({ method: 'POST', url: '/api/workflows', payload: draft })).statusCode, 400)
})

test('invalid graph, duplicate/unknown selections, and untrusted extra configuration fail closed without retries', async (t) => {
  for (const mode of ['id', 'duplicate', 'graph', 'extra'] as const) {
    const output = preparationFixture()
    if (mode === 'id') output.plan.webhookBindings![0].connectionId = 'invented'
    if (mode === 'duplicate') output.plan.webhookBindings!.push(output.plan.webhookBindings![0])
    if (mode === 'graph') output.plan.steps[1].id = 'missing'
    if (mode === 'extra') Object.assign(output.plan, { endpoint: 'https://injected.example.com' })
    let calls = 0
    const app = buildApp({ repository, connections: async () => [supportConnection], prepare: async () => { calls++; return output } }); t.after(() => app.close())
    assert.equal((await app.inject({ method: 'POST', url: '/api/prepare', payload })).statusCode, 502)
    assert.equal(calls, 1)
  }
})

test('unidentifiable input returns no workflow rather than inventing operations or connections', async (t) => {
  const output = preparationFixture()
  output.extraction.nodes = []; output.extraction.edges = []; output.extraction.webhooks = []
  output.plan.steps = []; output.plan.webhookBindings = []
  const app = buildApp({ repository, prepare: async () => output }); t.after(() => app.close())
  const response = await app.inject({ method: 'POST', url: '/api/prepare', payload: { prompt: 'Hello' } })
  assert.equal(response.statusCode, 422); assert.equal(response.json().error.code, 'NO_WORKFLOW_FOUND')
})

test('human-readable webhook event names are rejected explicitly without retrying, weakening validation, or saving', async (t) => {
  for (const event of ['Order created', 'order/created', 'Send an order notification']) {
    const output = preparationFixture(); output.extraction.webhooks[0].event = event
    let calls = 0
    const app = buildApp({ repository, prepare: async () => { calls++; return output } }); t.after(() => app.close())
    const response = await app.inject({ method: 'POST', url: '/api/prepare', payload })
    assert.equal(response.statusCode, 502); assert.equal(response.json().error.code, 'MUSE_INVALID_WEBHOOK_EVENT')
    assert.equal(calls, 1); assert.ok(!response.body.includes(event))
  }
})

test('saved automatic bindings cannot change destination or credential and retired connections cannot send', () => {
  const draft = preparationFixture()
  const hook = { id: 'notify', connectionId: 'support', configuredBy: 'muse', direction: 'outgoing', endpoint: { kind: 'external', urlTemplate: supportConnection.endpointUrl }, authentication: { ...supportConnection.authentication } }
  const plan = { webhooks: [hook] } as unknown as WorkflowDraft['plan']
  validateConnectionBindings(plan, [supportConnection])
  for (const mutate of [() => { hook.endpoint.urlTemplate += '/tampered' }, () => { hook.authentication.secretRef = 'other' }, () => { hook.connectionId = 'unknown' }]) {
    const copy = structuredClone(hook); mutate()
    assert.throws(() => validateConnectionBindings(plan, [supportConnection]), /changed/)
    Object.assign(hook, copy)
  }
  assert.throws(() => validateConnectionBindings(plan, []), /missing/)
  assert.ok(draft.plan.steps.length)
})

test('connection catalog persists outside the project, rejects malformed entries, and returns safe errors', async (t) => {
  const folder = await mkdtemp(join(tmpdir(), 'metaflow-connections-')); t.after(() => rm(folder, { recursive: true, force: true }))
  const file = join(folder, 'connections.json'); const env = { WEBHOOK_CONNECTIONS_FILE: file }
  assert.deepEqual(await loadConnections(env), [])
  await writeFile(file, JSON.stringify([supportConnection]))
  assert.deepEqual(await loadConnections(env), [supportConnection])
  for (const invalid of [[supportConnection, supportConnection], [{ ...supportConnection, endpointUrl: 'http://10.0.0.1/receiver' }], [{ ...supportConnection, secret: 'never-echo-this' }]]) assert.throws(() => parseConnections(invalid), /invalid/)
  await writeFile(file, 'never-echo-this')
  await assert.rejects(loadConnections(env), (error: unknown) => error instanceof Error && !error.message.includes('never-echo-this'))
})

test('preparation sends one bounded Muse request with names only and original attachment', async () => {
  let calls = 0
  const prepare = createMusePreparer({ getKey: async () => 'fake-key', send: async (_url, options) => {
    calls++; const body = JSON.parse(String(options?.body))
    assert.equal(body.store, false); assert.equal(body.max_output_tokens, 8192)
    assert.equal(body.reasoning.effort, 'minimal'); assert.equal(body.text.format.strict, true)
    assert.ok(!String(options?.body).includes('support_token')); assert.ok(!String(options?.body).includes(supportConnection.endpointUrl))
    assert.equal(body.input[0].content[1].type, 'input_image')
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(preparationFixture()) }] }] })
  } })
  await prepare({ ...payload, attachment: { name: 'diagram.png', mimeType: 'image/png', data: Buffer.from([137,80,78,71,13,10,26,10]).toString('base64') } }, new AbortController().signal, connectionSummaries([supportConnection]))
  assert.equal(calls, 1)
})

test('preparation shares the AI busy guard, rejects invalid input before generation, and releases after failure', async (t) => {
  let rejectFirst!: (reason: Error) => void
  let started!: () => void
  const running = new Promise<void>((resolve) => { started = resolve })
  let calls = 0
  const app = buildApp({ repository, prepare: async () => {
    calls++
    if (calls === 1) { started(); return new Promise((_resolve, reject) => { rejectFirst = reject }) }
    const output = preparationFixture(); output.plan.webhookBindings = []; return output
  } }); t.after(() => app.close())
  assert.equal((await app.inject({ method: 'POST', url: '/api/prepare', payload: { prompt: '' } })).statusCode, 400)
  assert.equal(calls, 0)
  const first = app.inject({ method: 'POST', url: '/api/prepare', payload })
  await running
  for (const url of ['/api/parse', '/api/prepare']) assert.equal((await app.inject({ method: 'POST', url, payload })).statusCode, 429)
  rejectFirst(new ApiError(502, 'MUSE_UNAVAILABLE', 'Provider unavailable.'))
  assert.equal((await first).statusCode, 502)
  assert.equal((await app.inject({ method: 'POST', url: '/api/prepare', payload })).statusCode, 200)
  assert.equal(calls, 2)
})

test('answered rules and newly available connections update the existing automatic draft in one explicit planning request', async (t) => {
  const initial = preparationFixture(); initial.plan.webhookBindings = []
  initial.plan.questions = [{ id: 'rule', stepId: 'send', question: 'Which priority?', explanation: 'Not specified.' }]
  initial.plan.steps[1].configuration = [{ label: 'Priority', value: '', needsInput: true }]
  let calls = 0
  const app = buildApp({ repository, connections: async () => [supportConnection], hasWebhookCredential: async () => true,
    prepare: async () => initial, plan: async (draft, _signal, summaries) => {
      calls++; assert.equal(draft.plan.questions.find((question) => question.id === 'rule')?.answer, 'Urgent')
      assert.deepEqual(summaries, connectionSummaries([supportConnection]))
      const proposal = preparationFixture().plan
      proposal.steps[1].configuration = [{ label: 'Priority', value: 'Urgent', needsInput: false }]
      return proposal
    },
  }); t.after(() => app.close())
  const prepared = await app.inject({ method: 'POST', url: '/api/prepare', payload })
  const draft = prepared.json().draft as WorkflowDraft
  draft.plan.questions.find((question) => question.id === 'rule')!.answer = 'Urgent'
  const updated = await app.inject({ method: 'POST', url: '/api/plan', payload: draft })
  assert.equal(updated.statusCode, 200, updated.body)
  const plan = updated.json().plan as WorkflowDraft['plan']
  assert.equal(plan.steps[1].configuration[0].value, 'Urgent')
  assert.equal(plan.webhooks[0].configuredBy, 'muse')
  assert.equal(plan.questions.some((question) => !question.answer?.trim()), false)
  assert.equal(calls, 1)
})
