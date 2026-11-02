import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID, createHmac } from 'node:crypto'
import { pinDestination, isPublicAddress, readDestinationPolicy } from '../src/webhooks/destination.ts'
import { createWebhookDeliveryService } from '../src/webhooks/service.ts'
import type { DeliveryRepository, StoredDelivery } from '../src/webhooks/repository.ts'
import type { SavedWorkflow } from '../../shared/workflows.ts'
import { draftFixture } from './fixtures.ts'
import { ApiError } from '../src/errors.ts'

function fixture() {
  const workflow: SavedWorkflow = { ...draftFixture(), id: randomUUID(), version: 1, createdAt: '', updatedAt: '' }
  workflow.plan.webhooks[0].endpoint.urlTemplate = 'https://receiver.example.test/events'
  workflow.plan.webhooks[0].setup = { endpointReviewed: true, authenticationReviewed: true, payloadReviewed: true }
  workflow.plan.steps[1].mappings = [{ source: 'request.subject', target: 'webhook.payload.subject' }]
  const records = new Map<string, StoredDelivery>()
  const deliveries: DeliveryRepository = {
    find: async (id) => records.get(id) ?? null,
    reserve: async (intent) => {
      const delivery = { id: intent.id, workflowId: intent.workflowId, workflowVersion: intent.workflowVersion, webhookId: intent.webhookId,
        status: 'pending' as const, httpStatus: null, durationMs: null, errorCode: null, createdAt: new Date().toISOString(), completedAt: null }
      records.set(intent.id, { delivery, fingerprint: intent.fingerprint }); return { delivery, created: true }
    },
    finish: async (id, result) => { const record = records.get(id)!; record.delivery = { ...record.delivery, ...result, completedAt: new Date().toISOString() }; return record.delivery },
    list: async () => [...records.values()].map((item) => item.delivery),
  }
  return { workflow, deliveries, records, request: { requestId: randomUUID(), expectedVersion: 1, sampleData: { request: { subject: 'Test order' } } as Record<string, unknown> } }
}
const publicDns = async () => [{ address: '93.184.216.34', family: 4 }]
const policy = { allowedOrigins: ['https://receiver.example.test'] }

test('destination policy rejects private addresses, mixed DNS, unsafe URLs, and unapproved local endpoints', async () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '172.16.1.1', '192.168.1.2', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '192.0.2.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '2001:db8::1', '2002:7f00:1::']) assert.equal(isPublicAddress(address), false, address)
  for (const address of ['93.184.216.34', '8.8.8.8', '2606:4700::1111']) assert.equal(isPublicAddress(address), true)
  for (const value of ['https://other.example.test/events', 'http://receiver.example.test/events', 'https://user:pass@receiver.example.test/events', 'https://receiver.example.test/events?key=secret', 'http://127.0.0.1:4000/events']) await assert.rejects(pinDestination(value, policy, publicDns))
  await assert.rejects(pinDestination('https://receiver.example.test/events', policy, async () => [...await publicDns(), { address: '10.0.0.1', family: 4 }]))
  assert.equal((await pinDestination('https://receiver.example.test/events', policy, publicDns)).address, '93.184.216.34')
  const local = 'http://127.0.0.1:4000/receiver'
  assert.equal((await pinDestination(local, { allowedOrigins: [], localReceiverUrl: local })).address, '127.0.0.1')
  await assert.rejects(pinDestination(`${local}/other`, { allowedOrigins: [], localReceiverUrl: local }))
  assert.throws(() => readDestinationPolicy({ WEBHOOK_LOCAL_RECEIVER_URL: 'http://10.0.0.1/receiver' }))
  assert.throws(() => readDestinationPolicy({ WEBHOOK_ALLOWED_ORIGINS: 'https://example.test/path' }))
})
test('delivery signs exact mapped bytes and duplicate IDs never send again or retain payloads and secrets', async () => {
  const f = fixture(); f.workflow.plan.webhooks[0].authentication.type = 'signature'
  let calls = 0
  const service = createWebhookDeliveryService({ workflows: { get: async () => f.workflow } as never, deliveries: f.deliveries, policy, resolve: publicDns, getSecret: async () => 'private-secret', send: async (destination, body, headers) => {
    calls++; assert.equal(destination.address, '93.184.216.34'); assert.deepEqual(JSON.parse(body), { subject: 'Test order' })
    assert.equal(headers['X-Token'], `sha256=${createHmac('sha256', 'private-secret').update(body).digest('hex')}`)
    assert.equal(headers['Idempotency-Key'], f.request.requestId); return 202
  } })
  const first = await service.deliver(f.workflow.id, 'notify', f.request)
  assert.equal(first.status, 'succeeded'); assert.equal(first.httpStatus, 202)
  assert.deepEqual(await service.deliver(f.workflow.id, 'notify', f.request), first); assert.equal(calls, 1)
  await assert.rejects(service.deliver(f.workflow.id, 'notify', { ...f.request, sampleData: { request: { subject: 'different' } } }), (e: unknown) => e instanceof ApiError && e.code === 'DELIVERY_ID_CONFLICT')
  assert.ok(!JSON.stringify([...f.records.values()]).includes('private-secret')); assert.ok(!JSON.stringify([...f.records.values()]).includes('Test order'))
})
test('preflight failures never reserve a delivery or contact a receiver', async () => {
  for (const kind of ['version', 'review', 'mapping', 'data', 'prototype', 'header', 'event', 'secret', 'incoming']) {
    const f = fixture()
    if (kind === 'version') f.request.expectedVersion = 2
    if (kind === 'review') f.workflow.plan.webhooks[0].setup!.endpointReviewed = false
    if (kind === 'mapping') f.workflow.plan.steps[1].mappings = []
    if (kind === 'data') f.request.sampleData = {}
    if (kind === 'prototype') { f.workflow.plan.webhooks[0].payloadTemplate.subject = '{{request.constructor}}'; f.workflow.plan.steps[1].mappings[0].source = 'request.constructor' }
    if (kind === 'header') f.workflow.plan.webhooks[0].authentication.headerName = 'Content-Length'
    if (kind === 'event') f.workflow.plan.webhooks[0].event = 'bad\r\nevent'
    if (kind === 'incoming') f.workflow.plan.webhooks[0].direction = 'incoming'
    const service = createWebhookDeliveryService({ workflows: { get: async () => f.workflow } as never, deliveries: f.deliveries, policy, resolve: publicDns, getSecret: async () => kind === 'secret' ? undefined : 'fake-secret', send: async () => { assert.fail('Must not send') } })
    await assert.rejects(service.deliver(f.workflow.id, 'notify', f.request), (e: unknown) => e instanceof ApiError); assert.equal(f.records.size, 0)
  }
})
test('network loss and result-storage failure retain an intent so neither is retried automatically', async () => {
  for (const storageFails of [false, true]) {
    const f = fixture(); if (storageFails) f.deliveries.finish = async () => { throw new Error('private database error') }
    let calls = 0
    const service = createWebhookDeliveryService({ workflows: { get: async () => f.workflow } as never, deliveries: f.deliveries, policy, resolve: publicDns, getSecret: async () => 'fake-secret', send: async () => { calls++; if (!storageFails) throw new Error('private network error'); return 200 } })
    if (storageFails) await assert.rejects(service.deliver(f.workflow.id, 'notify', f.request), (e: unknown) => e instanceof ApiError && e.code === 'DELIVERY_RESULT_UNAVAILABLE')
    else assert.equal((await service.deliver(f.workflow.id, 'notify', f.request)).status, 'unknown')
    assert.equal((await service.deliver(f.workflow.id, 'notify', f.request)).status, storageFails ? 'pending' : 'unknown'); assert.equal(calls, 1)
  }
})

test('a pending duplicate is returned without resending while a different delivery waits for the active send', async () => {
  const f = fixture()
  let entered!: () => void
  let release!: (status: number) => void
  const started = new Promise<void>((resolve) => { entered = resolve })
  let calls = 0
  const service = createWebhookDeliveryService({ workflows: { get: async () => f.workflow } as never, deliveries: f.deliveries, policy, resolve: publicDns, getSecret: async () => 'fake-secret',
    send: async () => { calls++; entered(); return new Promise<number>((resolve) => { release = resolve }) },
  })
  const first = service.deliver(f.workflow.id, 'notify', f.request)
  await started
  assert.equal((await service.deliver(f.workflow.id, 'notify', f.request)).status, 'pending')
  await assert.rejects(service.deliver(f.workflow.id, 'notify', { ...f.request, requestId: randomUUID() }), (e: unknown) => e instanceof ApiError && e.code === 'DELIVERY_BUSY')
  release(204)
  assert.equal((await first).status, 'succeeded')
  assert.equal(calls, 1)
})
