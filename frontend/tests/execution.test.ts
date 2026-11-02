import assert from 'node:assert/strict'
import test from 'node:test'
import { cancelRun, decideRepair, getRun, listRuns, proposeRepair, startRun } from '../src/features/execution/api.ts'
import { localTime } from '../src/features/execution/presentation.ts'

const run = { id: 'run-id', steps: [], events: [], repairs: [] }
test('run actions submit real input, saved versions, stable IDs and repair decisions once without browser credentials', async (t) => {
  const requests: { path: string; body: unknown }[] = []
  t.mock.method(globalThis, 'fetch', async (path: string, options: RequestInit) => {
    assert.equal(new Headers(options.headers).get('Authorization'), null)
    requests.push({ path, body: options.body ? JSON.parse(String(options.body)) : undefined })
    return Response.json({ run })
  })
  assert.deepEqual(await startRun('workflow-id', 3, { order: { id: 'order-1' } }, 'request-id', true), run)
  await proposeRepair('run-id', 4, 'repair-request'); await decideRepair('run-id', 'repair-id', 5, 'resume'); await decideRepair('run-id', 'repair-id', 6, 'reject'); await cancelRun('run-id')
  assert.deepEqual(requests, [
    { path: '/api/workflows/workflow-id/runs', body: { expectedVersion: 3, input: { order: { id: 'order-1' } }, requestId: 'request-id', autoRepair: true } },
    { path: '/api/runs/run-id/repairs', body: { requestId: 'repair-request', expectedRevision: 4 } },
    { path: '/api/runs/run-id/repairs/repair-id/resume', body: { expectedRevision: 5 } },
    { path: '/api/runs/run-id/repairs/repair-id/reject', body: { expectedRevision: 6 } },
    { path: '/api/runs/run-id/cancel', body: {} },
  ])
})

test('history and detail reads never start executions; backend errors and ambiguous network failures are safe and never retry', async (t) => {
  const paths: string[] = []
  t.mock.method(globalThis, 'fetch', async (path: string, options: RequestInit) => {
    paths.push(path); assert.equal(options.method, 'GET')
    return Response.json(path.endsWith('/runs') ? { runs: [] } : { run })
  })
  assert.deepEqual(await listRuns('workflow-id'), []); assert.deepEqual(await getRun('run-id'), run)
  assert.deepEqual(paths, ['/api/workflows/workflow-id/runs', '/api/runs/run-id'])
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('private-error') })
  await assert.rejects(startRun('w', 1, {}, 'r'), (error: unknown) => error instanceof Error && error.message.includes('may already have started') && !error.message.includes('private-error'))
  assert.equal(calls, 1)
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { code: 'REPAIR_NOT_AVAILABLE', message: 'do-not-display' } }, { status: 400 }))
  await assert.rejects(proposeRepair('r', 1, 'p'), (error: unknown) => error instanceof Error && error.message.includes('missing-field') && !error.message.includes('do-not-display'))
  t.mock.method(globalThis, 'fetch', async () => Response.json({ run: {} }))
  await assert.rejects(getRun('r'), /Unexpected run details/)
})

test('durable event times display in Manila regardless of the execution host timezone', () => {
  assert.match(localTime('2026-11-02T13:00:00Z'), /9:00/)
})
