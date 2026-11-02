import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { createPool, migrate } from '../src/database.ts'
import { mysqlWorkflows } from '../src/workflows/repository.ts'
import { mysqlDeliveries } from '../src/webhooks/repository.ts'
import { createWebhookDeliveryService } from '../src/webhooks/service.ts'
import { createExecutionService } from '../src/execution/service.ts'
import { mysqlRuns } from '../src/execution/repository.ts'
import { executionFixture } from './execution-fixtures.ts'
import { buildApp } from '../src/app.ts'

test('real MySQL and HTTP execute both branches, persist checkpoints, repair/resume safely, and retain versioned context after reopening', { skip: !process.env.TEST_DATABASE_URL }, async (t) => {
  const pool = createPool({ databaseUrl: process.env.TEST_DATABASE_URL!, databaseSsl: false }); t.after(() => pool.end()); await migrate(pool)
  const received: { event: string; body: unknown }[] = []
  const receiver = createServer(async (request, response) => {
    const parts: Buffer[] = []; for await (const part of request) parts.push(Buffer.from(part))
    assert.equal(request.headers['x-token'], 'integration-execution-secret')
    received.push({ event: String(request.headers['x-metaflow-event']), body: JSON.parse(Buffer.concat(parts).toString()) }); response.writeHead(204).end()
  })
  await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve))
  t.after(async () => { receiver.closeAllConnections(); await new Promise<void>((resolve) => receiver.close(() => resolve())) })
  const address = receiver.address(); assert.ok(address && typeof address !== 'string')
  const localReceiverUrl = `http://127.0.0.1:${address.port}/receiver`
  const { workflow: original, program } = executionFixture()
  original.plan.webhooks.forEach((hook) => { hook.endpoint.urlTemplate = localReceiverUrl })
  const workflows = mysqlWorkflows(pool); const runs = mysqlRuns(pool)
  const workflow = await workflows.create({ prompt: original.prompt, diagram: original.diagram, plan: original.plan })
  let compilerCalls = 0
  const delivery = createWebhookDeliveryService({ workflows, deliveries: mysqlDeliveries(pool), policy: { allowedOrigins: [], localReceiverUrl }, getSecret: async () => 'integration-execution-secret' })
  const service = createExecutionService({ workflows, runs, delivery, compile: async () => { compilerCalls++; return program }, repair: async () => ({ title: 'Map identifier', explanation: 'Use the existing identifier.', sourcePath: 'order.id', targetPath: 'order.legacy_id' }) })
  const app = buildApp({ repository: workflows, webhookDelivery: delivery, execution: service }); t.after(() => app.close())
  const input = { order: { id: 'database-order', total: 12000, currency: 'PHP' } }
  const start = async (data = input) => {
    const response = await app.inject({ method: 'POST', url: `/api/workflows/${workflow.id}/runs`, payload: { requestId: randomUUID(), expectedVersion: 1, input: data } })
    assert.equal(response.statusCode, 202, response.body); await service.drain(); return service.get(response.json().run.id)
  }
  const successful = await start(); assert.equal(successful.status, 'succeeded'); assert.equal(received.length, 1); assert.equal(received[0].event, 'order.approve'); assert.deepEqual(received[0].body, { order_id: 'database-order' })
  const rejected = await start({ order: { ...input.order, currency: 'USD' } }); assert.equal(rejected.status, 'succeeded'); assert.equal(received.length, 2); assert.equal(received[1].event, 'order.reject')
  assert.equal(rejected.steps.find((step) => step.stepId === 'enrich')?.status, 'skipped'); assert.equal(compilerCalls, 1)
  // A new saved version has a deliberately missing mapped field. This is synthetic failure data.
  const brokenDraft = { prompt: workflow.prompt, diagram: workflow.diagram, plan: structuredClone(workflow.plan) }
  brokenDraft.plan.webhooks[0].payloadTemplate = { order_id: '{{order.legacy_id}}' }
  brokenDraft.plan.steps.find((step) => step.id === 'approve')!.mappings = [{ source: 'order.legacy_id', target: 'webhook.payload.order_id' }]
  const broken = await workflows.update(workflow.id, 1, brokenDraft)
  const failure = await service.start(workflow.id, { requestId: randomUUID(), expectedVersion: broken.version, input, autoRepair: true }); await service.drain()
  const proposed = await service.get(failure.id)
  assert.equal(proposed.status, 'failed'); assert.equal(proposed.failure?.code, 'MISSING_FIELD'); assert.equal(proposed.repairs[0].status, 'proposed'); assert.equal(received.length, 2)
  // Advance the draft again: resume must keep the immutable version that failed.
  const newer = await workflows.update(workflow.id, 2, { ...brokenDraft, plan: { ...brokenDraft.plan, title: 'A newer draft' } })
  assert.equal(newer.version, 3)
  const resumed = await app.inject({ method: 'POST', url: `/api/runs/${failure.id}/repairs/${proposed.repairs[0].id}/resume`, payload: { expectedRevision: proposed.revision } })
  assert.equal(resumed.statusCode, 202, resumed.body); await service.drain()
  const recovered = await service.get(failure.id)
  assert.equal(recovered.status, 'succeeded'); assert.equal(recovered.workflowVersion, 2); assert.equal(recovered.snapshot.plan.title, workflow.plan.title); assert.equal(received.length, 3)
  assert.equal(recovered.steps.find((step) => step.stepId === 'approve')?.attempts.length, 2)
  assert.equal(recovered.steps.find((step) => step.stepId === 'enrich')?.attempts.length, 1)
  assert.equal(recovered.repairs[0].status, 'applied'); assert.equal((recovered.input.order as { legacy_id?: string }).legacy_id, undefined)
  assert.ok(recovered.events.some((event) => event.level === 'error')); assert.ok(recovered.events.some((event) => event.message.includes('Resuming without replaying')))
  const duplicate = await app.inject({ method: 'POST', url: `/api/runs/${failure.id}/repairs/${proposed.repairs[0].id}/resume`, payload: { expectedRevision: proposed.revision } }); assert.equal(duplicate.statusCode, 409); assert.equal(received.length, 3)
  await app.close()
  const reopenedPool = createPool({ databaseUrl: process.env.TEST_DATABASE_URL!, databaseSsl: false }); t.after(() => reopenedPool.end())
  const reopened = mysqlRuns(reopenedPool); const stored = await reopened.get(failure.id)
  assert.equal(stored?.status, 'succeeded'); assert.equal(stored?.repairs[0].status, 'applied'); assert.equal(stored?.steps.find((step) => step.stepId === 'approve')?.attempts[0].status, 'failed')
  assert.equal(stored?.steps.find((step) => step.stepId === 'approve')?.attempts[1].definition?.kind, 'webhook')
  assert.equal((await reopened.list(workflow.id)).length, 3)
  assert.deepEqual(await reopened.aliases(workflow.id, 2), [{ sourcePath: 'order.id', targetPath: 'order.legacy_id', fromRunId: failure.id, stepId: 'approve' }])
  assert.ok(!JSON.stringify(stored).includes('integration-execution-secret'))
})
