import assert from 'node:assert/strict'
import test from 'node:test'
import { parseWorkflow } from '../src/features/diagram-parsing/api.ts'
import { sampleDiagram } from '../src/features/diagram-parsing/data/sampleDiagram.ts'
import { samplePlan } from '../src/features/workflows/data/samplePlan.ts'

const result = { model: 'muse-spark-1.3', draft: { prompt: 'Order flow', diagram: sampleDiagram, plan: samplePlan } }
test('parsing submits the actual description and image bytes without a browser API key', async (t) => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    calls++
    assert.equal(url, '/api/prepare')
    assert.equal(options.method, 'POST')
    assert.equal(new Headers(options.headers).get('Authorization'), null)
    const body = JSON.parse(String(options.body))
    assert.equal(body.prompt, 'Order flow')
    assert.equal(body.attachment.mimeType, 'image/png')
    assert.equal(body.attachment.data, btoa('test-image-bytes'))
    return Response.json(result)
  })
  assert.deepEqual(await parseWorkflow(' Order flow ', new File(['test-image-bytes'], 'diagram.png', { type: 'image/png' }), new AbortController().signal), result)
  assert.equal(calls, 1)
})

test('provider failure and exhausted output have different messages without automatic retry', async (t) => {
  for (const [code, message] of [
    ['MUSE_OUTPUT_LIMIT', /output limit/], ['MUSE_INCOMPLETE', /did not finish/], ['MUSE_UNAVAILABLE', /server error/],
    ['MUSE_INVALID_WEBHOOK_EVENT', /event such as order.created/],
  ] as const) {
    let calls = 0
    t.mock.method(globalThis, 'fetch', async () => {
      calls++
      return Response.json({ error: { code, message: 'do-not-display' } }, { status: 502 })
    })
    await assert.rejects(parseWorkflow('Orders', null, new AbortController().signal), (error: unknown) => error instanceof Error && message.test(error.message) && !error.message.includes('do-not-display'))
    assert.equal(calls, 1)
  }
})

test('text-only input is supported and rejected input or cancelled submissions never make a request', async (t) => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
    calls++
    assert.deepEqual(JSON.parse(String(options.body)), { prompt: 'Order flow' })
    return Response.json(result)
  })
  await parseWorkflow('Order flow', null, new AbortController().signal)
  await assert.rejects(parseWorkflow('', null, new AbortController().signal), /Describe your workflow/)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(parseWorkflow('Order flow', null, controller.signal))
  assert.equal(calls, 1)
})

test('parse failures show known actionable messages and never substitute a sample or raw server content', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { code: 'MUSE_NOT_CONFIGURED', message: 'do-not-display' } }, { status: 503 }))
  await assert.rejects(parseWorkflow('Orders', null, new AbortController().signal), (e: unknown) => e instanceof Error && e.message.includes('muse:setup') && !e.message.includes('do-not-display'))
  t.mock.method(globalThis, 'fetch', async () => Response.json({ nonsense: true }))
  await assert.rejects(parseWorkflow('Orders', null, new AbortController().signal), /unexpected result/)
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('do-not-display') })
  await assert.rejects(parseWorkflow('Orders', null, new AbortController().signal), /Check the backend/)
})
