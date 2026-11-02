import assert from 'node:assert/strict'
import test from 'node:test'
import { buildApp } from '../src/app.ts'
import { ApiError } from '../src/errors.ts'
import { createMusePlanner } from '../src/muse/planning.ts'
import type { PlanningProposal } from '../../shared/planning.ts'
import type { WorkflowRepository } from '../src/workflows/repository.ts'
import { draftFixture, proposalFixture } from './fixtures.ts'

const noStorage = async (): Promise<never> => { assert.fail('Planning must not read or write the database') }
const repository: WorkflowRepository = { health: noStorage, list: noStorage, get: noStorage, create: noStorage, update: noStorage }

test('planning keeps reviewed steps, webhook setup, diagram identity, and draft name without saving', async (t) => {
  const draft = draftFixture()
  draft.plan.structureReviewed = true
  draft.plan.steps[0].reviewed = true
  draft.plan.steps[0].configuration = [{ label: 'Source', value: 'Support inbox', needsInput: false }]
  const proposal = proposalFixture(draft)
  proposal.steps[0].operation = 'AI replacement'
  proposal.steps[0].configuration[0].value = 'AI replacement'
  proposal.steps[1].operation = 'Prepare support message'
  const original = structuredClone(draft)
  let calls = 0
  const app = buildApp({ repository, plan: async () => { calls++; return proposal } })
  t.after(() => app.close())
  const response = await app.inject({ method: 'POST', url: '/api/plan', payload: draft })
  assert.equal(response.statusCode, 200)
  const { plan, model } = response.json()
  assert.equal(model, 'muse-spark-1.3')
  assert.equal(plan.title, draft.plan.title)
  assert.equal(plan.sourceDiagramId, draft.diagram.id)
  assert.equal(plan.structureReviewed, true)
  assert.deepEqual(plan.steps[0], draft.plan.steps[0])
  assert.equal(plan.steps[1].operation, 'Prepare support message')
  assert.equal(plan.steps[1].reviewed, false)
  assert.equal(plan.steps[1].webhookTemplateId, 'notify')
  assert.deepEqual(plan.webhooks, draft.plan.webhooks)
  assert.deepEqual(plan.edges, draft.plan.edges)
  assert.equal(plan.checks.find((check: { id: string }) => check.id === 'execution').status, 'not-run')
  assert.deepEqual(draft, original)
  assert.equal(calls, 1)
})

test('answered questions survive reused IDs, repeated wording, and bounded ID collisions', async (t) => {
  const draft = draftFixture()
  const id = 'q'.repeat(120)
  draft.plan.questions = [{ id, stepId: 'start', question: 'Which source?', explanation: 'Choose source.', answer: 'Support inbox' }]
  const proposal = proposalFixture(draft)
  proposal.questions = [
    { id, stepId: 'send', question: 'Which channel?', explanation: 'Choose destination.' },
    { id: 'repeated', stepId: 'start', question: 'Which source?', explanation: 'AI explanation' },
    { id: `${'q'.repeat(118)}-2`, stepId: 'send', question: 'Which team?', explanation: '' },
  ]
  const app = buildApp({ repository, plan: async () => proposal })
  t.after(() => app.close())
  const response = await app.inject({ method: 'POST', url: '/api/plan', payload: draft })
  assert.equal(response.statusCode, 200)
  const questions = response.json().plan.questions
  assert.equal(questions.length, 3)
  assert.equal(new Set(questions.map((question: { id: string }) => question.id)).size, 3)
  assert.deepEqual(questions.find((question: { id: string }) => question.id === id), draft.plan.questions[0])
  const added = questions.find((question: { question: string }) => question.question === 'Which channel?')
  assert.equal(added.id, `${'q'.repeat(118)}-3`)
  assert.equal(added.answer, undefined)
})

test('malformed proposals cannot change the graph or hide bad questions behind preserved answers', async (t) => {
  const draft = draftFixture()
  draft.plan.steps[0].reviewed = true
  draft.plan.questions = [{ id: 'answered', stepId: 'start', question: 'Source?', explanation: '', answer: 'Inbox' }]
  const mutations: ((proposal: PlanningProposal) => void)[] = [
    (value) => { value.steps.pop() },
    (value) => { value.steps.push(structuredClone(value.steps[0])) },
    (value) => { value.steps[1].id = 'unknown' },
    (value) => { value.steps[0].role = 'action' },
    (value) => { value.questions = [{ id: 'answered', stepId: 'unknown', question: 'Bad reference?', explanation: '' }] },
    (value) => { const question = { id: 'answered', stepId: 'start', question: 'Question?', explanation: '' }; value.questions = [question, question] },
    (value) => { value.steps[1].title = ' ' },
    (value) => { Object.assign(value.steps[1], { apiKey: 'do-not-expose' }) },
  ]
  for (const mutate of mutations) {
    const proposal = proposalFixture(draft)
    mutate(proposal)
    const app = buildApp({ repository, plan: async () => proposal })
    t.after(() => app.close())
    const response = await app.inject({ method: 'POST', url: '/api/plan', payload: draft })
    assert.equal(response.statusCode, 502)
    assert.equal(response.json().error.code, 'MUSE_INVALID_RESPONSE')
    assert.equal(response.json().plan, undefined)
    assert.ok(!response.body.includes('do-not-expose'))
  }
})

test('planning rejects reviewed webhook mapping changes and invalid source drafts', async (t) => {
  const draft = draftFixture()
  draft.plan.steps[1].mappings = [{ source: 'request.subject', target: 'webhook.payload.subject' }]
  draft.plan.webhooks[0].setup = { endpointReviewed: false, authenticationReviewed: false, payloadReviewed: true }
  const proposal = proposalFixture(draft)
  proposal.steps[1].mappings[0].source = 'request.other'
  let calls = 0
  const app = buildApp({ repository, plan: async () => { calls++; return proposal } })
  t.after(() => app.close())
  const invalidProposal = await app.inject({ method: 'POST', url: '/api/plan', payload: draft })
  assert.equal(invalidProposal.statusCode, 502)
  assert.equal(invalidProposal.json().error.code, 'MUSE_INVALID_RESPONSE')
  draft.plan.steps[1].mappings = []
  const invalidSource = await app.inject({ method: 'POST', url: '/api/plan', payload: draft })
  assert.equal(invalidSource.statusCode, 400)
  assert.equal(calls, 1)
})

test('parse and planning share a busy slot and release it after planning fails', async (t) => {
  let entered!: () => void
  const started = new Promise<void>((resolve) => { entered = resolve })
  let rejectPlan!: (reason: unknown) => void
  let calls = 0
  const app = buildApp({ repository, plan: async () => {
    calls++
    if (calls > 1) return proposalFixture()
    entered()
    return new Promise((_resolve, reject) => { rejectPlan = reject })
  }, parse: async () => { assert.fail('Busy parsing must never call Muse') } })
  t.after(() => app.close())
  const first = app.inject({ method: 'POST', url: '/api/plan', payload: draftFixture() }).then((response) => response)
  await started
  for (const [url, payload] of [['/api/parse', { prompt: 'Order flow' }], ['/api/plan', draftFixture()]] as const) {
    assert.equal((await app.inject({ method: 'POST', url, payload })).statusCode, 429)
  }
  rejectPlan(new ApiError(502, 'MUSE_UNAVAILABLE', 'Provider failed.'))
  assert.equal((await first).statusCode, 502)
  assert.equal((await app.inject({ method: 'POST', url: '/api/plan', payload: draftFixture() })).statusCode, 200)
  assert.equal(calls, 2)
})

test('planner excludes endpoint and credential references and sends one bounded structured request', async () => {
  const draft = draftFixture()
  draft.plan.webhooks[0].endpoint.urlTemplate = 'https://private-destination.example.test/secret-route'
  draft.plan.webhooks[0].authentication.secretRef = 'private_reference_123'
  let calls = 0
  const plan = createMusePlanner({ getKey: async () => 'fake-server-key', send: async (_url, options) => {
    calls++
    const body = JSON.parse(String(options?.body))
    assert.deepEqual(body.reasoning, { effort: 'low' })
    assert.equal(body.text.format.strict, true)
    assert.equal(body.max_output_tokens, 8192)
    assert.equal(body.store, false)
    assert.ok(!String(options?.body).includes('private_reference_123'))
    assert.ok(!String(options?.body).includes('private-destination'))
    assert.ok(!String(options?.body).includes('fake-server-key'))
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(proposalFixture(draft)) }] }] })
  } })
  assert.deepEqual(await plan(draft, new AbortController().signal), proposalFixture(draft))
  assert.equal(calls, 1)
})
