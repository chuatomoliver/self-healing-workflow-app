import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { purchaseFixture } from './purchase-fixture.ts'
import { memoryRuns } from './execution-fixtures.ts'
import { createExecutionService } from '../src/execution/service.ts'
import { createWebhookDeliveryService } from '../src/webhooks/service.ts'
import type { DeliveryRepository, StoredDelivery } from '../src/webhooks/repository.ts'
import type { WorkflowRepository } from '../src/workflows/repository.ts'
import { parseProgram } from '../src/execution/program.ts'
import { createMuseCompiler } from '../src/muse/execution.ts'
import { createExecutionProgramCache } from '../src/execution/program-cache.ts'
import { workflowFieldCanonicalizer } from '../../shared/fieldPaths.ts'

test('six-node purchase review executes straight-line decisions and resolves node-prefixed Slack payloads without repair or real sends', async () => {
  const { workflow, program, connection } = purchaseFixture()
  const workflows: WorkflowRepository = { health: async () => {}, list: async () => [], get: async () => workflow,
    create: async () => { assert.fail('This simulation must not save a workflow') }, update: async () => { assert.fail('This simulation must not update a workflow') } }
  const records = new Map<string, StoredDelivery>()
  const deliveries: DeliveryRepository = {
    find: async (id) => records.get(id) ?? null,
    reserve: async (intent) => { const delivery = { id: intent.id, workflowId: intent.workflowId, workflowVersion: intent.workflowVersion, webhookId: intent.webhookId,
      status: 'pending' as const, httpStatus: null, durationMs: null, errorCode: null, createdAt: '', completedAt: null }; records.set(intent.id, { delivery, fingerprint: intent.fingerprint }); return { delivery, created: true } },
    finish: async (id, result) => { const item = records.get(id)!; item.delivery = { ...item.delivery, ...result }; return item.delivery },
    list: async () => [...records.values()].map((item) => item.delivery),
  }
  let sends = 0
  const delivery = createWebhookDeliveryService({ workflows, deliveries, policy: { allowedOrigins: [] }, connections: async () => [connection],
    getSecret: async () => 'https://hooks.slack.com/services/T_TEST/B_TEST/PRIVATE_TEST', resolve: async () => [{ address: '93.184.216.34', family: 4 }],
    send: async (_destination, body) => { sends++; const payload = JSON.parse(body); assert.equal(Object.keys(payload).join(','), 'text'); assert.match(payload.text, /PR-001.*Alex.*IT.*15000 PHP.*true.*Manager review required/); return 200 },
  })
  const service = createExecutionService({ workflows, runs: memoryRuns(), delivery, compile: async () => program, repair: async () => { assert.fail('No repair is needed for proven field prefixes') } })
  const started = await service.start(workflow.id, { requestId: randomUUID(), expectedVersion: 1, input: {}, autoRepair: true })
  await service.drain()
  const result = await service.get(started.id)
  assert.equal(result.status, 'succeeded', result.failure?.message)
  assert.equal(result.steps.filter((step) => step.status === 'succeeded').length, 6)
  assert.equal(result.repairs.length, 0); assert.equal(sends, 1)
})

test('straight-line decision compatibility does not accept invented branches, nonconditional assignments, or undeclared result fields', () => {
  const { workflow, program } = purchaseFixture()
  assert.ok(parseProgram(program, workflow))
  for (const mode of ['branch', 'constant', 'output', 'validation']) {
    const copy = structuredClone(program)
    if (mode === 'branch') copy.steps[3].kind = 'branch'
    if (mode === 'constant') copy.steps[3].assignments[0].kind = 'constant'
    if (mode === 'output') copy.steps[3].assignments[0].target = 'purchase.unrequested'
    if (mode === 'validation') copy.steps[2].validPath = 'purchase.unrequested'
    assert.throws(() => parseProgram(copy, workflow), (error: unknown) => error instanceof Error, mode)
  }
  const canonical = workflowFieldCanonicalizer(workflow.plan)
  assert.equal(canonical('n5.notification.text'), 'notification.text')
  workflow.plan.steps[4].outputs.push({ name: 'n5.notification.text', description: 'An explicitly nested field.' })
  assert.equal(workflowFieldCanonicalizer(workflow.plan)('n5.notification.text'), 'n5.notification.text')
  assert.equal(canonical('unknown.notification.text'), 'unknown.notification.text')
})

test('validated compiler cache survives new compiler instances, omits credentials, and invalidates when workflow setup changes', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'metaflow-program-cache-'))
  t.after(async () => { assert.equal(dirname(resolve(directory)), resolve(tmpdir())); assert.match(directory, /metaflow-program-cache-/); await rm(directory, { recursive: true, force: true }) })
  const { workflow, program } = purchaseFixture()
  let requests = 0
  const send: typeof fetch = async () => { requests++; return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(program) }] }] }) }
  const compile = () => createMuseCompiler({ cache: createExecutionProgramCache(directory), getKey: async () => 'fake-key', send })
  const first = await compile()(workflow, new AbortController().signal)
  assert.deepEqual(await compile()(workflow, new AbortController().signal), first)
  assert.equal(requests, 1)
  const file = (await readdir(directory))[0]
  const content = await readFile(join(directory, file), 'utf8')
  assert.ok(!content.includes('slack_purchase')); assert.ok(!content.includes('hooks.slack.com')); assert.ok(!content.includes('fake-key'))
  await compile()({ ...workflow, version: 2 }, new AbortController().signal)
  assert.equal(requests, 2)
  const changed = structuredClone(workflow); changed.plan.steps[1].configuration.push({ label: 'purchase.amount', value: '1000' })
  await compile()(changed, new AbortController().signal)
  assert.equal(requests, 3)
  const corrupted = JSON.parse(content)
  corrupted.program.steps[0].kind = 'unsupported'
  await writeFile(join(directory, file), JSON.stringify(corrupted))
  await assert.rejects(compile()(workflow, new AbortController().signal))
  assert.equal(requests, 3, 'Invalid cached setup must not trigger a paid retry')
  const before = (await readdir(directory)).length
  const invalidCompile = createMuseCompiler({ cache: createExecutionProgramCache(directory), getKey: async () => 'fake-key', send: async () => Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(corrupted.program) }] }] }) })
  await assert.rejects(invalidCompile({ ...workflow, id: randomUUID() }, new AbortController().signal))
  assert.equal((await readdir(directory)).length, before, 'Failed definitions must never enter the cache')
})
