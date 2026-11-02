import assert from 'node:assert/strict'
import test from 'node:test'
import type { SavedWorkflow, WorkflowDraft } from '../../shared/workflows.ts'
import { samplePlan } from '../src/features/workflows/data/samplePlan.ts'
import { sampleDiagram } from '../src/features/diagram-parsing/data/sampleDiagram.ts'
import { isWorkflowDirty } from '../src/features/workflows/draftState.ts'
import { getWorkflow, listWorkflows, saveWorkflow, WorkflowApiError } from '../src/features/workflows/api.ts'

const draft: WorkflowDraft = { plan: samplePlan, diagram: sampleDiagram, prompt: 'Route support requests.' }
const saved: SavedWorkflow = { ...draft, id: 'a990dd99-dd29-4e41-9151-8bbc486155e1', version: 1, createdAt: '2026-10-30T00:00:00.000Z', updatedAt: '2026-10-30T00:00:00.000Z' }

test('dirty tracking ignores database JSON object key ordering and tracks actual draft changes', () => {
  function reverseKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(reverseKeys)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverseKeys(item)]))
    return value
  }
  assert.equal(isWorkflowDirty(draft, null), true)
  assert.equal(isWorkflowDirty(draft, saved), false)
  assert.equal(isWorkflowDirty(draft, reverseKeys(saved) as SavedWorkflow), false)
  assert.equal(isWorkflowDirty({ ...draft, prompt: 'A different description.' }, saved), true)
  assert.equal(isWorkflowDirty({ ...draft, plan: { ...draft.plan, title: 'Updated title' } }, saved), true)
})
test('saves through the backend and includes the expected version on updates', async (t) => {
  const calls: { path: string; init?: RequestInit }[] = []
  t.mock.method(globalThis, 'fetch', async (input: string, init?: RequestInit) => {
    calls.push({ path: input, init })
    return Response.json({ workflow: saved })
  })
  assert.deepEqual(await saveWorkflow(draft, null), saved)
  assert.equal(calls[0].path, '/api/workflows')
  assert.equal(calls[0].init?.method, 'POST')
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), draft)
  await saveWorkflow(draft, saved)
  assert.equal(calls[1].init?.method, 'PATCH')
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)), { expectedVersion: 1, draft })
  const headers = calls[1].init?.headers as Record<string, string> | undefined
  assert.equal(headers?.Authorization, undefined)
})
test('retrieves saved drafts and reports version conflicts without displaying arbitrary server content', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input: string) => Response.json(input === '/api/workflows' ? { workflows: [saved] } : { workflow: saved }))
  assert.equal((await listWorkflows())[0].id, saved.id)
  assert.equal((await getWorkflow(saved.id)).id, saved.id)
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { code: 'VERSION_CONFLICT', message: 'DO_NOT_DISPLAY', requestId: 'r1' } }, { status: 409 }))
  await assert.rejects(saveWorkflow(draft, saved), (error: unknown) => error instanceof WorkflowApiError && error.status === 409 && error.message.includes('another tab') && !error.message.includes('DO_NOT_DISPLAY'))
})
test('turns unreachable backends and invalid responses into actionable errors', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch') })
  await assert.rejects(listWorkflows(), (error: unknown) => error instanceof WorkflowApiError && error.code === 'NETWORK_ERROR')
  t.mock.method(globalThis, 'fetch', async () => Response.json({ unexpected: true }))
  await assert.rejects(listWorkflows(), (error: unknown) => error instanceof WorkflowApiError && error.code === 'INVALID_RESPONSE')
})
