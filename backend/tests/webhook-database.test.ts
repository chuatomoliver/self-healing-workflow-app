import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:http'
import { randomUUID, createHmac } from 'node:crypto'
import { createPool, migrate } from '../src/database.ts'
import { buildApp } from '../src/app.ts'
import { mysqlWorkflows } from '../src/workflows/repository.ts'
import { mysqlDeliveries } from '../src/webhooks/repository.ts'
import { createWebhookDeliveryService } from '../src/webhooks/service.ts'
import { draftFixture } from './fixtures.ts'
import { supportConnection, preparationFixture } from './preparation-fixture.ts'
import type { WorkflowDraft } from '../../shared/workflows.ts'

test('automatic setup persists and delivers to a real local receiver without manual setup flags or paid AI', { skip: !process.env.TEST_DATABASE_URL }, async (t) => {
  const pool = createPool({ databaseUrl: process.env.TEST_DATABASE_URL!, databaseSsl: false })
  t.after(() => pool.end()); await migrate(pool)
  let hits = 0
  const receiver = createServer(async (request, response) => {
    hits++
    const parts: Buffer[] = []; for await (const part of request) parts.push(Buffer.from(part))
    assert.deepEqual(JSON.parse(Buffer.concat(parts).toString()), { subject: 'Prepared notification' })
    assert.equal(request.headers['x-token'], 'integration-only-secret')
    response.writeHead(204).end()
  })
  await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve))
  t.after(async () => { receiver.closeAllConnections(); await new Promise<void>((resolve) => receiver.close(() => resolve())) })
  const address = receiver.address(); assert.ok(address && typeof address !== 'string')
  const localReceiverUrl = `http://127.0.0.1:${address.port}/receiver`
  let catalog = [{ ...supportConnection, endpointUrl: localReceiverUrl }]
  const connections = async () => catalog
  const workflows = mysqlWorkflows(pool)
  const service = createWebhookDeliveryService({ workflows, deliveries: mysqlDeliveries(pool), policy: { allowedOrigins: [], localReceiverUrl }, connections, getSecret: async () => 'integration-only-secret' })
  let aiCalls = 0
  const app = buildApp({ repository: workflows, webhookDelivery: service, connections, hasWebhookCredential: async () => true, prepare: async () => { aiCalls++; return preparationFixture() } })
  t.after(() => app.close())
  const prepared = await app.inject({ method: 'POST', url: '/api/prepare', payload: { prompt: 'Send supplied request subjects to Support notifications.' } })
  assert.equal(prepared.statusCode, 200, prepared.body)
  const draft = prepared.json().draft as WorkflowDraft
  assert.equal(hits, 0); assert.equal(draft.plan.webhooks[0].setup?.endpointReviewed, false)
  const saved = await app.inject({ method: 'POST', url: '/api/workflows', payload: draft })
  assert.equal(saved.statusCode, 201, saved.body)
  const workflow = saved.json().workflow
  const reopened = (await app.inject(`/api/workflows/${workflow.id}`)).json().workflow
  assert.equal(reopened.plan.configurationMode, 'automatic'); assert.equal(reopened.plan.webhooks[0].connectionId, 'support')
  const url = `/api/workflows/${workflow.id}/webhooks/notify/test-deliveries`
  const send = () => app.inject({ method: 'POST', url, payload: { requestId: randomUUID(), expectedVersion: 1, sampleData: { request: { subject: 'Prepared notification' } } } })
  const delivered = await send()
  assert.equal(delivered.statusCode, 200, delivered.body); assert.equal(delivered.json().delivery.httpStatus, 204); assert.equal(hits, 1)
  catalog = []
  const blocked = await send(); assert.equal(blocked.statusCode, 400); assert.equal(blocked.json().error.code, 'CONNECTION_CHANGED'); assert.equal(hits, 1)
  assert.equal(aiCalls, 1)
})

test('real HTTP and MySQL: authentication, redirects, timeout, duplicate protection, storage failures, and history', { skip: !process.env.TEST_DATABASE_URL }, async (t) => {
  const pool = createPool({ databaseUrl: process.env.TEST_DATABASE_URL!, databaseSsl: false })
  t.after(() => pool.end()); await migrate(pool)
  let hits = 0; let redirectedHits = 0; let mode = 'accept'; let credential: string | undefined = 'local-test-secret'
  const timers: ReturnType<typeof setTimeout>[] = []
  const receiver = createServer(async (request, response) => {
    if (request.url !== '/receiver') { redirectedHits++; response.writeHead(500).end(); return }
    hits++
    const parts: Buffer[] = []; for await (const part of request) parts.push(Buffer.from(part))
    const body = Buffer.concat(parts).toString()
    assert.deepEqual(JSON.parse(body), { subject: 'Delivery test' })
    const signature = `sha256=${createHmac('sha256', 'local-test-secret').update(body).digest('hex')}`
    if (!['local-test-secret', signature].includes(String(request.headers['x-token']))) { response.writeHead(401).end('do-not-display secret body'); return }
    if (mode === 'redirect') { response.writeHead(302, { Location: '/redirect-target' }).end(); return }
    if (mode === 'timeout') { timers.push(setTimeout(() => response.writeHead(204).end(), 700)); return }
    response.writeHead(204).end()
  })
  await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve))
  t.after(async () => { timers.forEach(clearTimeout); receiver.closeAllConnections(); await new Promise<void>((resolve) => receiver.close(() => resolve())) })
  const address = receiver.address(); assert.ok(address && typeof address !== 'string')
  const localReceiverUrl = `http://127.0.0.1:${address.port}/receiver`
  const workflows = mysqlWorkflows(pool); const deliveries = mysqlDeliveries(pool)
  const service = createWebhookDeliveryService({ workflows, deliveries, policy: { allowedOrigins: [], localReceiverUrl }, getSecret: async () => credential, timeoutMs: 200 })
  const app = buildApp({ repository: workflows, webhookDelivery: service }); t.after(() => app.close())
  const draft = draftFixture()
  draft.plan.webhooks[0].endpoint.urlTemplate = localReceiverUrl
  draft.plan.webhooks[0].setup = { endpointReviewed: true, authenticationReviewed: true, payloadReviewed: true }
  draft.plan.steps[1].mappings = [{ source: 'request.subject', target: 'webhook.payload.subject' }]
  const created = await app.inject({ method: 'POST', url: '/api/workflows', payload: draft })
  assert.equal(created.statusCode, 201)
  const workflow = created.json().workflow; const path = `/api/workflows/${workflow.id}/webhooks/notify`
  const input = { requestId: randomUUID(), expectedVersion: 1, sampleData: { request: { subject: 'Delivery test' } } }
  const send = (payload = { ...input, requestId: randomUUID() }) => app.inject({ method: 'POST', url: `${path}/test-deliveries`, payload })
  const accepted = await send(input)
  assert.equal(accepted.statusCode, 200); assert.equal(accepted.json().delivery.status, 'succeeded'); assert.equal(accepted.json().delivery.httpStatus, 204)
  assert.deepEqual((await send(input)).json(), accepted.json()); assert.equal(hits, 1)
  assert.equal((await send({ ...input, sampleData: { request: { subject: 'Other' } } })).statusCode, 409)
  credential = 'wrong-secret'
  const rejected = await send(); assert.equal(rejected.json().delivery.httpStatus, 401); assert.equal(rejected.json().delivery.status, 'failed'); assert.ok(!rejected.body.includes('secret body'))
  credential = 'local-test-secret'; mode = 'redirect'
  assert.equal((await send()).json().delivery.httpStatus, 302); assert.equal(redirectedHits, 0)
  mode = 'timeout'
  const timedOut = await send(); assert.equal(timedOut.json().delivery.status, 'unknown'); assert.equal(timedOut.json().delivery.errorCode, 'TIMEOUT'); assert.equal(hits, 4)
  mode = 'accept'; draft.plan.webhooks[0].authentication.type = 'signature'
  assert.equal((await app.inject({ method: 'PATCH', url: `/api/workflows/${workflow.id}`, payload: { expectedVersion: 1, draft } })).statusCode, 200)
  assert.equal((await send()).statusCode, 409)
  const signed = await send({ ...input, requestId: randomUUID(), expectedVersion: 2 }); assert.equal(signed.json().delivery.status, 'succeeded'); assert.equal(signed.json().delivery.workflowVersion, 2)
  const beforeFailure = hits
  await pool.query("CREATE TRIGGER fail_delivery_test BEFORE INSERT ON webhook_deliveries FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'private failure'")
  try {
    const failed = await send({ ...input, requestId: randomUUID(), expectedVersion: 2 }); assert.equal(failed.statusCode, 503); assert.ok(!failed.body.includes('private failure')); assert.equal(hits, beforeFailure)
  } finally { await pool.query('DROP TRIGGER fail_delivery_test') }
  await pool.query("CREATE TRIGGER fail_delivery_result BEFORE UPDATE ON webhook_deliveries FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'private failure'")
  const uncertainInput = { ...input, requestId: randomUUID(), expectedVersion: 2 }
  try { const failed = await send(uncertainInput); assert.equal(failed.statusCode, 503); assert.equal(failed.json().error.code, 'DELIVERY_RESULT_UNAVAILABLE') }
  finally { await pool.query('DROP TRIGGER fail_delivery_result') }
  assert.equal((await send(uncertainInput)).json().delivery.status, 'pending'); assert.equal(hits, beforeFailure + 1)
  // Closing the app and opening a fresh pool must preserve all attempt results.
  await app.close()
  const reopenedPool = createPool({ databaseUrl: process.env.TEST_DATABASE_URL!, databaseSsl: false }); t.after(() => reopenedPool.end())
  const reopened = buildApp({ repository: mysqlWorkflows(reopenedPool), webhookDelivery: createWebhookDeliveryService({ workflows: mysqlWorkflows(reopenedPool), deliveries: mysqlDeliveries(reopenedPool), policy: { allowedOrigins: [] } }) }); t.after(() => reopened.close())
  const history = await reopened.inject(`${path}/deliveries`)
  assert.equal(history.statusCode, 200); assert.equal(history.json().deliveries.length, 6)
  assert.ok(!history.body.includes('local-test-secret')); assert.ok(!history.body.includes('Delivery test'))
  assert.equal(history.json().deliveries.find((item: { id: string }) => item.id === input.requestId).httpStatus, 204)
})
