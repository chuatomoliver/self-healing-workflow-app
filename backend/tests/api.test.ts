import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { buildApp } from '../src/app.ts'
import { ApiError } from '../src/errors.ts'
import type { WorkflowRepository } from '../src/workflows/repository.ts'
import { draftFixture } from './fixtures.ts'
import { refreshPlanChecks } from '../../shared/setup.ts'

function repository(): WorkflowRepository {
  return {
    async health() {}, async list() { return [] },
    async get() { throw new ApiError(404, 'WORKFLOW_NOT_FOUND', 'This workflow could not be found.') },
    async create(draft) { return { ...draft, id: randomUUID(), version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } },
    async update() { throw new ApiError(409, 'VERSION_CONFLICT', 'A newer version has been saved.') },
  }
}
test('serves health, draft creation, listing, and consistent errors', async (t) => {
  const app = buildApp({ repository: repository() })
  t.after(() => app.close())
  assert.equal((await app.inject('/api/health')).statusCode, 200)
  assert.deepEqual((await app.inject('/api/workflows')).json(), { workflows: [] })
  const response = await app.inject({ method: 'POST', url: '/api/workflows', payload: draftFixture() })
  assert.equal(response.statusCode, 201)
  assert.equal(response.headers['cache-control'], 'no-store')
  assert.equal(response.headers.location, `/api/workflows/${response.json().workflow.id}`)
  assert.equal(response.json().workflow.version, 1)
  const missing = await app.inject(`/api/workflows/${randomUUID()}`)
  assert.equal(missing.statusCode, 404)
  assert.equal(missing.json().error.code, 'WORKFLOW_NOT_FOUND')
  assert.equal(typeof missing.json().error.requestId, 'string')
  assert.equal((await app.inject('/api/workflows/not-a-uuid')).statusCode, 400)
  assert.equal((await app.inject('/api/unknown')).json().error.code, 'NOT_FOUND')
})
test('rejects invalid bodies, unknown fields, coercion, and oversized requests', async (t) => {
  const app = buildApp({ repository: repository() })
  t.after(() => app.close())
  const invalid = [
    {}, { ...draftFixture(), apiKey: 'private-value' }, { ...draftFixture(), prompt: 42 },
    { ...draftFixture(), prompt: 'x'.repeat(4001) },
    { ...draftFixture(), plan: { ...draftFixture().plan, title: '   ' } },
    { ...draftFixture(), plan: { ...draftFixture().plan, steps: [] } },
  ]
  for (const payload of invalid) assert.equal((await app.inject({ method: 'POST', url: '/api/workflows', payload })).statusCode, 400)
  const unknownNested = draftFixture()
  Object.assign(unknownNested.plan.webhooks[0].authentication, { apiKey: 'private-value' })
  const rejected = await app.inject({ method: 'POST', url: '/api/workflows', payload: unknownNested })
  assert.equal(rejected.statusCode, 400)
  assert.ok(!rejected.body.includes('private-value'))
  assert.equal((await app.inject({ method: 'POST', url: '/api/workflows', payload: { prompt: 'x'.repeat(513 * 1024) } })).statusCode, 413)
  assert.equal((await app.inject({ method: 'POST', url: '/api/workflows', headers: { 'content-type': 'application/json' }, payload: '{broken' })).statusCode, 400)
  assert.equal((await app.inject({ method: 'PATCH', url: `/api/workflows/${randomUUID()}`, payload: { expectedVersion: '1', draft: draftFixture() } })).statusCode, 400)
})
test('validates graph integrity and webhook credential references before storage', async (t) => {
  const app = buildApp({ repository: repository() })
  t.after(() => app.close())
  const mutations: ((draft: ReturnType<typeof draftFixture>) => void)[] = [
    (draft) => { draft.plan.edges[0].target = 'missing' },
    (draft) => { draft.diagram.nodes[1].id = 'start' },
    (draft) => { draft.plan.steps[1].webhookTemplateId = 'missing' },
    (draft) => { draft.plan.edges = [] },
    (draft) => { draft.plan.webhooks[0].direction = 'incoming' },
    (draft) => { draft.plan.sourceDiagramId = 'missing' },
    (draft) => { draft.plan.questions.push({ id: 'q', stepId: 'missing', question: '', explanation: '' }) },
    (draft) => { draft.plan.edges.push({ id: 'cycle', source: 'send', target: 'start' }) },
    (draft) => { draft.plan.webhooks[0].endpoint.urlTemplate = 'https://user:secret@example.invalid/notify' },
    (draft) => { draft.plan.webhooks[0].endpoint.urlTemplate = 'https://example.invalid/notify?token=secret' },
  ]
  for (const mutate of mutations) {
    const draft = draftFixture(); mutate(draft)
    assert.equal((await app.inject({ method: 'POST', url: '/api/workflows', payload: draft })).json().error.code, 'INVALID_WORKFLOW')
  }
})
test('rejects cross-origin and non-local hosts and sanitizes database errors', async (t) => {
  const repo = repository()
  repo.health = async () => { throw new Error('password=DO_NOT_EXPOSE') }
  const app = buildApp({ repository: repo })
  t.after(() => app.close())
  for (const headers of [{ origin: 'https://attacker.example' }, { host: 'attacker.example' }, { 'sec-fetch-site': 'cross-site' }]) {
    assert.equal((await app.inject({ url: '/api/workflows', headers })).statusCode, 403)
  }
  assert.equal((await app.inject({ url: '/api/workflows', headers: { origin: 'http://127.0.0.1:5173' } })).statusCode, 200)
  const health = await app.inject('/api/health')
  assert.equal(health.statusCode, 503)
  assert.ok(!health.body.includes('DO_NOT_EXPOSE'))
})

test('create and update derive setup checks from actual configuration before writing', async (t) => {
  const repo = repository()
  let writes = 0
  const saved = (draft: ReturnType<typeof draftFixture>, version: number) => ({ ...draft, id: randomUUID(), version, createdAt: '', updatedAt: '' })
  repo.create = async (draft) => { writes++; return saved(draft, 1) }
  repo.update = async (_id, _version, draft) => { writes++; return saved(draft, 2) }
  const app = buildApp({ repository: repo })
  t.after(() => app.close())
  const draft = draftFixture()
  draft.plan.checks = [{ id: 'fabricated', title: 'Everything reviewed', description: 'Stale browser state', status: 'reviewed' }]
  for (const request of [
    { method: 'POST' as const, url: '/api/workflows', payload: draft },
    { method: 'PATCH' as const, url: `/api/workflows/${randomUUID()}`, payload: { expectedVersion: 1, draft } },
  ]) {
    const response = await app.inject(request)
    assert.ok([200, 201].includes(response.statusCode))
    assert.deepEqual(response.json().workflow.plan.checks, refreshPlanChecks(draft.plan).checks)
    assert.equal(response.json().workflow.plan.checks.find((check: { id: string }) => check.id === 'webhooks').status, 'needs-input')
  }
  draft.plan.steps[0].configuration = [{ label: 'Source', value: '', needsInput: true }]
  draft.plan.steps[0].reviewed = true
  assert.equal((await app.inject({ method: 'POST', url: '/api/workflows', payload: draft })).statusCode, 400)
  assert.equal(writes, 2)
})
