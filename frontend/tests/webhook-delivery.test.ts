import assert from 'node:assert/strict'
import test from 'node:test'
import { deliverTestWebhook, listDeliveries, DeliveryRequestError } from '../src/features/workflows/deliveryApi.ts'

test('delivery posts saved version, data, and request ID once, with no browser credential', async (t) => {
  const input = { requestId: 'test-id', expectedVersion: 2, sampleData: { order: { id: 'test-order' } } }
  let calls = 0
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    calls++; assert.equal(url, '/api/workflows/workflow/webhooks/sales/test-deliveries'); assert.equal(options.method, 'POST')
    assert.deepEqual(JSON.parse(String(options.body)), input); assert.equal(new Headers(options.headers).get('Authorization'), null)
    return Response.json({ delivery: { id: 'test-id', status: 'succeeded', httpStatus: 204 } })
  })
  assert.equal((await deliverTestWebhook('workflow', 'sales', input)).httpStatus, 204); assert.equal(calls, 1)
})
test('unknown outcomes differ from preflight errors; refreshing history never sends a webhook', async (t) => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('private error') })
  await assert.rejects(deliverTestWebhook('workflow', 'sales', { requestId: 'id', expectedVersion: 1, sampleData: {} }), (e: unknown) => e instanceof DeliveryRequestError && e.uncertain && !e.message.includes('private'))
  assert.equal(calls, 1)
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { code: 'WEBHOOK_DATA_REQUIRED', message: 'private body' } }, { status: 400 }))
  await assert.rejects(deliverTestWebhook('workflow', 'sales', { requestId: 'id', expectedVersion: 1, sampleData: {} }), (e: unknown) => e instanceof DeliveryRequestError && !e.uncertain && !e.message.includes('private'))
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => { assert.ok(url.endsWith('/deliveries')); assert.equal(options.method, undefined); return Response.json({ deliveries: [] }) })
  assert.deepEqual(await listDeliveries('workflow', 'sales', new AbortController().signal), [])
})
