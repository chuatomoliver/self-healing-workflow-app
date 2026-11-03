import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createSlackSetup } from '../src/webhooks/slack.ts'
import { loadConnections, saveConnection } from '../src/webhooks/connections.ts'
import { SLACK_ENDPOINT, SLACK_REFERENCE_HEADER, validSlackWebhookUrl } from '../../shared/slack.ts'
import type { SlackSetupResult } from '../../shared/slack.ts'
import type { WorkflowDraft, SavedWorkflow } from '../../shared/workflows.ts'
import { configureSlackWorkflow } from '../../frontend/src/features/workflows/slackSetup.ts'
import { workflowSetupSummary } from '../../shared/setup.ts'
import { validateDraft } from '../src/workflows/validation.ts'
import { buildApp } from '../src/app.ts'
import type { WorkflowRepository } from '../src/workflows/repository.ts'
import type { DeliveryRepository, StoredDelivery } from '../src/webhooks/repository.ts'
import { createWebhookDeliveryService } from '../src/webhooks/service.ts'
import { createExecutionService } from '../src/execution/service.ts'
import { executable, memoryRuns } from './execution-fixtures.ts'
import { draftFixture } from './fixtures.ts'
import { supportConnection } from './preparation-fixture.ts'

const fakeUrl = 'https://hooks.slack.com/services/T_TEST/B_TEST/SECRET_TEST'
const setupInput = { name: 'Slack notifications', channel: '#general', webhookUrl: fakeUrl }
const savedConnection: SlackSetupResult = { channel: '#general', connection: {
  id: 'slack_test', name: setupInput.name, description: 'Send Slack notifications to #general.', slackChannel: '#general',
  endpointUrl: SLACK_ENDPOINT, authentication: { type: 'slack-webhook', headerName: SLACK_REFERENCE_HEADER, secretRef: 'slack_test' },
} }

export function slackDraft(): WorkflowDraft {
  const draft = draftFixture()
  draft.prompt = 'Start manually, set a message, and send it to Slack.'
  draft.diagram.nodes = [
    { id: 'start', role: 'trigger', label: 'Manual Trigger', description: '', position: { x: 0, y: 0 } },
    { id: 'message', role: 'transform', label: 'Set Message', description: '', position: { x: 200, y: 0 } },
    { id: 'send', role: 'action', label: 'Slack: Send Message', description: '', position: { x: 400, y: 0 } },
  ]
  draft.diagram.edges = [{ id: 'e1', source: 'start', target: 'message' }, { id: 'e2', source: 'message', target: 'send' }]
  draft.plan.steps = draft.diagram.nodes.map((node) => ({ id: node.id, role: node.role, title: node.label, description: '',
    operation: node.id === 'start' ? 'manual_trigger' : node.id === 'message' ? 'set_message' : 'slack.send_message',
    inputs: [], outputs: [], mappings: [], configuration: [], configuredBy: 'muse',
  }))
  draft.plan.edges = structuredClone(draft.diagram.edges)
  draft.plan.structureReviewed = true
  draft.plan.webhooks = []
  draft.plan.questions = [
    { id: 'account', stepId: 'send', question: 'Which Slack account/connection should be used?', explanation: 'No saved connection.' },
    { id: 'channel', stepId: 'send', question: 'Which Slack channel should receive the message?', explanation: 'The destination is missing.' },
  ]
  return draft
}

function memoryWorkflows(workflow?: SavedWorkflow): WorkflowRepository {
  return { health: async () => {}, list: async () => [], get: async () => { assert.ok(workflow); return workflow },
    create: async (draft) => ({ ...draft, id: randomUUID(), version: 1, createdAt: '', updatedAt: '' }),
    update: async () => { throw new Error('Not used') },
  }
}

function deliveryFixture() {
  const draft = slackDraft()
  draft.plan = configureSlackWorkflow(draft.plan, savedConnection, 'Hello team!')
  const workflow: SavedWorkflow = { ...draft, id: randomUUID(), version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  const records = new Map<string, StoredDelivery>()
  const deliveries: DeliveryRepository = {
    find: async (id) => records.get(id) ?? null,
    reserve: async (intent) => {
      const delivery = { id: intent.id, workflowId: intent.workflowId, workflowVersion: intent.workflowVersion, webhookId: intent.webhookId,
        status: 'pending' as const, httpStatus: null, durationMs: null, errorCode: null, createdAt: '', completedAt: null }
      records.set(intent.id, { delivery, fingerprint: intent.fingerprint }); return { delivery, created: true }
    },
    finish: async (id, result) => { const item = records.get(id)!; item.delivery = { ...item.delivery, ...result }; return item.delivery },
    list: async () => [...records.values()].map((item) => item.delivery),
  }
  return { workflow, deliveries, records, request: { requestId: randomUUID(), expectedVersion: 1, sampleData: { notification: { text: 'Hello team!' } } } }
}

test('Slack URL validation accepts only secret-bearing Slack incoming webhook URLs', () => {
  assert.equal(validSlackWebhookUrl(fakeUrl), true)
  for (const value of ['http://hooks.slack.com/services/T/B/S', `${fakeUrl}?key=x`, `${fakeUrl}#secret`, `${fakeUrl}/extra`, `${fakeUrl}\n`,
    fakeUrl.replace('hooks.slack.com', 'hooks.slack.com.evil.test'), fakeUrl.replace('hooks.slack.com', 'user@hooks.slack.com'),
    fakeUrl.replace('hooks.slack.com', 'hooks.slack.com:443'), 'https://hooks.slack.com/services/T/B/../S', 'https://127.0.0.1/services/T/B/S'])
    assert.equal(validSlackWebhookUrl(value), false)
})

test('Slack setup persists reusable metadata and stores the URL only in credentials; concurrent saves preserve other connections', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'metaflow-slack-test-'))
  t.after(async () => { assert.equal(dirname(resolve(directory)), resolve(tmpdir())); assert.match(directory, /metaflow-slack-test-/); await rm(directory, { recursive: true, force: true }) })
  const env = { WEBHOOK_CONNECTIONS_FILE: join(directory, 'connections.json') }
  await saveConnection(supportConnection, env)
  const credentials = new Map<string, string>()
  const setup = createSlackSetup({ env, credentialStore: (target) => ({ read: async () => credentials.get(target), write: async (value) => { credentials.set(target, value) }, remove: async () => { credentials.delete(target) } }) })
  const results = await Promise.all([setup(setupInput), setup({ ...setupInput, name: 'Another Slack connection', channel: '#testing' })])
  assert.equal(credentials.size, 2)
  assert.equal((await loadConnections(env)).length, 3)
  for (const result of results) {
    assert.equal(credentials.get(`Metaflow/Webhook/${result.connection.authentication.secretRef}`), fakeUrl)
    assert.equal(result.connection.endpointUrl, SLACK_ENDPOINT)
    assert.ok(!JSON.stringify(result).includes('SECRET_TEST'))
  }
  assert.ok(!(await readFile(env.WEBHOOK_CONNECTIONS_FILE, 'utf8')).includes('SECRET_TEST'))
  assert.equal((await loadConnections(env))[0].id, supportConnection.id)
})

test('invalid Slack setup never stores credentials and failed catalog writes remove only the newly generated credential', async (t) => {
  let writes = 0; let removes = 0
  const directory = await mkdtemp(join(tmpdir(), 'metaflow-slack-test-'))
  t.after(async () => { assert.equal(dirname(resolve(directory)), resolve(tmpdir())); assert.match(directory, /metaflow-slack-test-/); await rm(directory, { recursive: true, force: true }) })
  const setup = createSlackSetup({ env: { WEBHOOK_CONNECTIONS_FILE: directory }, credentialStore: () => ({ read: async () => undefined, write: async () => { writes++ }, remove: async () => { removes++ } }) })
  await assert.rejects(setup({ ...setupInput, webhookUrl: 'https://evil.test/secret' }))
  assert.equal(writes, 0)
  await assert.rejects(setup(setupInput), (error: unknown) => error instanceof Error && !error.message.includes('SECRET_TEST'))
  assert.equal(writes, 1); assert.equal(removes, 1)
})

test('Slack setup routes enforce local origins, reject extra fields, and never return the secret URL', async (t) => {
  let calls = 0
  const app = buildApp({ repository: memoryWorkflows(), connections: async () => [savedConnection.connection], setupSlack: async () => { calls++; return savedConnection } })
  t.after(() => app.close())
  const response = await app.inject({ method: 'POST', url: '/api/connections/slack', payload: setupInput })
  assert.equal(response.statusCode, 201); assert.equal(calls, 1); assert.ok(!response.body.includes('SECRET_TEST'))
  assert.equal((await app.inject('/api/connections/slack')).json().connections[0].channel, '#general')
  for (const headers of [{ origin: 'https://evil.test' }, { 'sec-fetch-site': 'cross-site' }, { host: 'evil.test' }])
    assert.equal((await app.inject({ method: 'POST', url: '/api/connections/slack', headers, payload: setupInput })).statusCode, 403)
  assert.equal((await app.inject({ method: 'POST', url: '/api/connections/slack', payload: { ...setupInput, extra: true } })).statusCode, 400)
  assert.equal(calls, 1)
})

test('Slack setup converts the three-node native draft into a valid runnable webhook plan without losing other questions or calling AI', async (t) => {
  const draft = slackDraft()
  draft.plan.questions.push({ id: 'other', stepId: 'send', question: 'Should messages be sent for urgent orders only?', explanation: 'Business rule.' })
  const original = structuredClone(draft)
  draft.plan = configureSlackWorkflow(draft.plan, savedConnection, 'Hello team!')
  assert.deepEqual(draft.diagram, original.diagram)
  assert.equal(draft.plan.questions[2].answer, undefined)
  assert.equal(original.plan.questions[0].answer, undefined)
  assert.equal(workflowSetupSummary(draft.plan).answeredQuestions, 2)
  draft.plan.questions.pop()
  assert.equal(workflowSetupSummary(draft.plan).complete, true)
  assert.equal(draft.plan.steps[2].operation, 'send_webhook')
  validateDraft(draft)
  const app = buildApp({ repository: memoryWorkflows(), connections: async () => [savedConnection.connection], plan: async () => { assert.fail('Must not call AI') } })
  t.after(() => app.close())
  const response = await app.inject({ method: 'POST', url: '/api/workflows', payload: draft })
  assert.equal(response.statusCode, 201, response.body)
  assert.ok(!response.body.includes('SECRET_TEST'))
  const leaked = structuredClone(draft); leaked.plan.webhooks[0].endpoint.urlTemplate = fakeUrl
  assert.equal((await app.inject({ method: 'POST', url: '/api/workflows', payload: leaked })).statusCode, 400)
})

test('Slack delivery resolves its stored URL, enforces pinned DNS, sends text without an auth header, and deduplicates', async () => {
  const f = deliveryFixture(); let calls = 0
  const service = createWebhookDeliveryService({ workflows: memoryWorkflows(f.workflow), deliveries: f.deliveries, policy: { allowedOrigins: [] },
    connections: async () => [savedConnection.connection], getSecret: async () => fakeUrl, resolve: async () => [{ address: '93.184.216.34', family: 4 }],
    send: async (destination, body, headers) => {
      calls++; assert.equal(destination.url.href, fakeUrl); assert.equal(destination.address, '93.184.216.34')
      assert.deepEqual(JSON.parse(body), { text: 'Hello team!' })
      assert.equal(headers[SLACK_REFERENCE_HEADER], undefined); assert.equal(headers.Authorization, undefined)
      assert.ok(!JSON.stringify(headers).includes('SECRET_TEST')); return 200
    },
  })
  const id = f.workflow.plan.webhooks[0].id
  assert.equal((await service.deliver(f.workflow.id, id, f.request)).status, 'succeeded')
  assert.equal((await service.deliver(f.workflow.id, id, f.request)).status, 'succeeded'); assert.equal(calls, 1)
  assert.ok(!JSON.stringify([...f.records.values()]).includes('SECRET_TEST'))
})

test('Slack rejects changed bindings, missing secrets, foreign URLs, private DNS, non-text messages, and channel overrides before delivery', async () => {
  for (const mode of ['binding', 'missing-binding', 'secret', 'foreign', 'private', 'text', 'channel']) {
    const f = deliveryFixture(); const hook = f.workflow.plan.webhooks[0]
    if (mode === 'binding') hook.endpoint.urlTemplate = 'https://evil.test/endpoint'
    if (mode === 'missing-binding') delete hook.connectionId
    if (mode === 'channel') { hook.payloadTemplate.channel = '{{notification.channel}}'; f.workflow.plan.steps[2].mappings.push({ source: 'notification.channel', target: 'webhook.payload.channel' }) }
    const service = createWebhookDeliveryService({ workflows: memoryWorkflows(f.workflow), deliveries: f.deliveries, policy: { allowedOrigins: [] },
      connections: async () => [savedConnection.connection], getSecret: async () => mode === 'secret' ? undefined : mode === 'foreign' ? 'https://evil.test/endpoint' : fakeUrl,
      resolve: async () => [{ address: mode === 'private' ? '127.0.0.1' : '93.184.216.34', family: 4 }], send: async () => { assert.fail('Must not send') },
    })
    const input = { ...f.request, sampleData: { notification: { text: mode === 'text' ? 123 : 'Hello team!', channel: '#other' } } }
    await assert.rejects(service.deliver(f.workflow.id, hook.id, input)); assert.equal(f.records.size, 0)
  }
})

test('three-node Slack execution assigns the configured text and completes; run history excludes the secret URL', async () => {
  const f = deliveryFixture(); const runs = memoryRuns(); let sends = 0
  const workflows = memoryWorkflows(f.workflow)
  const delivery = createWebhookDeliveryService({ workflows, deliveries: f.deliveries, policy: { allowedOrigins: [] }, connections: async () => [savedConnection.connection],
    getSecret: async () => fakeUrl, resolve: async () => [{ address: '93.184.216.34', family: 4 }], send: async (_destination, body) => { sends++; assert.deepEqual(JSON.parse(body), { text: 'Hello team!' }); return 200 },
  })
  const service = createExecutionService({ workflows, runs, delivery, compile: async () => ({ steps: [
    executable('start', 'input'), executable('message', 'assign', { assignments: [{ target: 'notification.text', kind: 'constant', value: 'Hello team!', source: '', template: '', condition: { path: '', operator: 'exists', value: null }, otherwise: null }] }),
    executable('send', 'webhook'),
  ] }) })
  const started = await service.start(f.workflow.id, { requestId: randomUUID(), expectedVersion: 1, input: {} })
  await service.drain()
  const run = await service.get(started.id)
  assert.equal(run.status, 'succeeded'); assert.equal(sends, 1)
  assert.equal(run.steps.filter((step) => step.status === 'succeeded').length, 3)
  assert.ok(!JSON.stringify(run).includes('SECRET_TEST'))
})
