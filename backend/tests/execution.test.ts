import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import type { RunData } from '../../shared/execution.ts'
import type { WebhookDelivery } from '../../shared/deliveries.ts'
import { buildApp } from '../src/app.ts'
import { createExecutionService } from '../src/execution/service.ts'
import { availableFields, executeLocalStep, parseProgram, readPath, validateData } from '../src/execution/program.ts'
import { createMuseCompiler, createMuseRepairer } from '../src/muse/execution.ts'
import type { WorkflowRepository } from '../src/workflows/repository.ts'
import { executionFixture, executable, memoryRuns } from './execution-fixtures.ts'

const validInput = { order: { id: 'order-1', total: 12500, currency: 'PHP' } }
function harness() {
  const { workflow, program } = executionFixture(); const runs = memoryRuns()
  let compileCalls = 0; let repairCalls = 0
  const sends: { id: string; hook: string; input: RunData }[] = []
  let deliveryStatus: WebhookDelivery['status'] = 'succeeded'
  const workflows: WorkflowRepository = { health: async () => {}, list: async () => [], get: async () => structuredClone(workflow), create: async () => { throw new Error('Not used') }, update: async () => { throw new Error('Not used') } }
  const delivery = { localReceiverUrl: undefined, list: async () => [], deliver: async (_id: string, hook: string, input: { requestId: string; sampleData: RunData }): Promise<WebhookDelivery> => {
    sends.push({ id: input.requestId, hook, input: structuredClone(input.sampleData) })
    return { id: input.requestId, workflowId: workflow.id, workflowVersion: 1, webhookId: hook, status: deliveryStatus, httpStatus: deliveryStatus === 'succeeded' ? 204 : null, durationMs: 1, errorCode: deliveryStatus === 'unknown' ? 'TIMEOUT' : null, createdAt: new Date().toISOString(), completedAt: new Date().toISOString() }
  } }
  const compile = async () => { compileCalls++; return structuredClone(program) }
  const repair = async () => { repairCalls++; return { title: 'Reuse the existing order identifier', explanation: 'The original order.id supplies the missing identifier alias.', sourcePath: 'order.id', targetPath: 'order.legacy_id' } }
  const service = createExecutionService({ workflows, runs, delivery, compile, repair })
  const start = (input = validInput, requestId = randomUUID()) => service.start(workflow.id, { requestId, expectedVersion: 1, input })
  return { workflow, program, runs, sends, workflows, delivery, compile, repair, service, start, calls: () => ({ compileCalls, repairCalls }), setDeliveryStatus: (status: WebhookDelivery['status']) => { deliveryStatus = status } }
}

test('real interpreter executes six nodes, uses strict numeric rules, chooses one branch, and reuses compiled setup', async () => {
  const h = harness()
  const initial = structuredClone(validInput)
  const first = await h.start(); await h.service.drain()
  const run = (await h.service.get(first.id))
  assert.equal(run.status, 'succeeded'); assert.equal(readPath(run.context, 'order.priority'), 'high')
  assert.equal(readPath(run.context, 'order.summary'), 'Order order-1 total 12500 PHP')
  assert.equal(run.steps.find((step) => step.stepId === 'reject')?.status, 'skipped'); assert.deepEqual(h.sends.map((send) => send.hook), ['approve'])
  assert.equal(run.steps.find((step) => step.stepId === 'approve')?.attempts[0].definition?.kind, 'webhook')
  assert.deepEqual(run.input, initial); assert.deepEqual(validInput, initial)
  const invalid = await h.start({ order: { ...validInput.order, currency: 'USD' } }); await h.service.drain()
  const rejected = await h.service.get(invalid.id)
  assert.equal(rejected.status, 'succeeded'); assert.equal(rejected.steps.find((step) => step.stepId === 'enrich')?.status, 'skipped')
  assert.equal(rejected.steps.find((step) => step.stepId === 'approve')?.status, 'skipped'); assert.deepEqual(h.sends.map((send) => send.hook), ['approve', 'reject'])
  assert.equal(h.calls().compileCalls, 1)
  const validation = executeLocalStep(h.program.steps[1], { order: { id: 'x', total: '12500', currency: 'PHP' } })
  assert.equal(readPath(validation.context, 'order.valid'), false)
  const fresh = createExecutionService({ workflows: h.workflows, runs: h.runs, delivery: h.delivery, compile: async () => { assert.fail('A saved program must survive service restart') } })
  const next = await fresh.start(h.workflow.id, { requestId: randomUUID(), expectedVersion: 1, input: validInput }); await fresh.drain(); assert.equal((await fresh.get(next.id)).status, 'succeeded')
})

test('AI repair adds an evidenced field alias, resumes only the failed checkpoint, and reuses successful repairs in later runs', async () => {
  const h = harness(); h.program.steps[3].assignments[1].template = 'Order {{order.legacy_id}}'
  const started = await h.start(); await h.service.drain()
  const failed = await h.service.get(started.id)
  assert.equal(failed.status, 'failed'); assert.equal(failed.failure?.code, 'MISSING_FIELD'); assert.equal(h.sends.length, 0)
  const requestId = randomUUID()
  await h.service.proposeRepair(failed.id, requestId, failed.revision); await h.service.drain()
  const reviewed = await h.service.get(failed.id); const proposal = reviewed.repairs[0]
  assert.equal(proposal.status, 'proposed'); assert.ok(proposal.checks.every((check) => check.passed))
  await h.service.proposeRepair(failed.id, requestId, failed.revision); assert.equal(h.calls().repairCalls, 1)
  await h.service.resume(failed.id, proposal.id, reviewed.revision); await h.service.drain()
  const recovered = await h.service.get(failed.id)
  assert.equal(recovered.status, 'succeeded'); assert.equal(h.sends.length, 1)
  assert.equal(recovered.steps.find((step) => step.stepId === 'input')?.attempts.length, 1)
  assert.equal(recovered.steps.find((step) => step.stepId === 'validate')?.attempts.length, 1)
  assert.equal(recovered.steps.find((step) => step.stepId === 'enrich')?.attempts.length, 2)
  assert.equal(recovered.steps.find((step) => step.stepId === 'enrich')?.attempts[0].status, 'failed')
  assert.equal(readPath(recovered.input, 'order.legacy_id'), undefined); assert.equal(readPath(recovered.context, 'order.legacy_id'), 'order-1')
  assert.equal(recovered.repairs[0].status, 'applied')
  await assert.rejects(h.service.resume(failed.id, proposal.id, reviewed.revision), /Refresh/)
  const next = await h.start(); await h.service.drain(); const inherited = await h.service.get(next.id)
  assert.equal(inherited.status, 'succeeded'); assert.equal(inherited.inheritedAliases.length, 1); assert.equal(inherited.inheritedAliases[0].fromRunId, failed.id)
  assert.equal(h.calls().repairCalls, 1)
})

test('completed external deliveries are never repeated by a repair and resume', async () => {
  const h = harness()
  const ids = ['input', 'approve', 'enrich', 'reject']
  h.workflow.plan.steps = h.workflow.plan.steps.filter((step) => ids.includes(step.id))
  h.workflow.diagram.nodes = h.workflow.diagram.nodes.filter((step) => ids.includes(step.id))
  const edges = [{ id: 'a', source: 'input', target: 'approve' }, { id: 'b', source: 'approve', target: 'enrich' }, { id: 'c', source: 'enrich', target: 'reject' }]
  h.workflow.plan.edges = edges; h.workflow.diagram.edges = edges
  h.program.steps = [executable('input', 'input'), executable('approve', 'webhook'), executable('enrich', 'assign', { assignments: [{ target: 'order.summary', kind: 'template', template: '{{order.legacy_id}}', source: '', value: null, otherwise: null, condition: { path: '', operator: 'exists', value: null } }] }), executable('reject', 'webhook')]
  const started = await h.start(); await h.service.drain(); assert.deepEqual(h.sends.map((send) => send.hook), ['approve'])
  const failed = await h.service.get(started.id); await h.service.proposeRepair(failed.id, randomUUID(), failed.revision); await h.service.drain()
  const proposed = await h.service.get(failed.id); await h.service.resume(failed.id, proposed.repairs[0].id, proposed.revision); await h.service.drain()
  assert.deepEqual(h.sends.map((send) => send.hook), ['approve', 'reject'])
  assert.equal((await h.service.get(failed.id)).steps.find((step) => step.stepId === 'approve')?.attempts.length, 1)
})

test('duplicate start IDs are idempotent, conflicting requests fail, and uncertain deliveries are not repaired or retried', async () => {
  const h = harness(); const id = randomUUID()
  await Promise.all([h.start(validInput, id), h.start(validInput, id)]); await h.service.drain()
  assert.equal(h.sends.length, 1); assert.equal(h.runs.records.size, 1)
  await assert.rejects(h.start({ order: { ...validInput.order, total: 1 } }, id), /different input/)
  h.setDeliveryStatus('unknown')
  const next = await h.start(); await h.service.drain(); const uncertain = await h.service.get(next.id)
  assert.equal(uncertain.status, 'unknown'); assert.equal(uncertain.failure?.code, 'DELIVERY_UNKNOWN')
  await assert.rejects(h.service.proposeRepair(next.id, randomUUID(), uncertain.revision), /uncertainty/)
  assert.equal(h.calls().repairCalls, 0)
})

test('rejected and unsafe repair proposals cannot alter the checkpoint or execute a step', async () => {
  const h = harness(); h.program.steps[3].requiredPaths = ['order.legacy_id']
  const started = await h.start(); await h.service.drain(); const failed = await h.service.get(started.id)
  await h.service.proposeRepair(failed.id, randomUUID(), failed.revision); await h.service.drain()
  const proposed = await h.service.get(failed.id)
  await h.service.rejectRepair(failed.id, proposed.repairs[0].id, proposed.revision)
  const rejected = await h.service.get(failed.id); assert.deepEqual(rejected.context, failed.context); assert.equal(h.sends.length, 0)
  await assert.rejects(h.service.resume(failed.id, proposed.repairs[0].id, rejected.revision), /no longer/)
  const unsafe = createExecutionService({ workflows: h.workflows, runs: h.runs, delivery: h.delivery, repair: async () => ({ title: 'Bad', explanation: 'Overwrite data', sourcePath: 'order.id', targetPath: 'order.total' }) })
  await unsafe.proposeRepair(failed.id, randomUUID(), rejected.revision); await unsafe.drain()
  const blocked = await unsafe.get(failed.id); assert.equal(blocked.repairs.at(-1)?.status, 'unavailable'); assert.deepEqual(blocked.context, failed.context)
})

test('program validation rejects graph changes, prototype paths, missing rules, unsupported connectors, and malformed input before side effects', () => {
  const { workflow, program } = executionFixture()
  for (const mutation of [
    (copy: typeof program) => { copy.steps[0].stepId = 'invented' },
    (copy: typeof program) => { copy.steps[2].trueTarget = 'approve' },
    (copy: typeof program) => { copy.steps[1].rules = [] },
    (copy: typeof program) => { copy.steps[3].assignments[0].target = 'order.__proto__.key' },
    (copy: typeof program) => { Object.assign(copy.steps[0], { code: 'eval' }) },
    (copy: typeof program) => { copy.steps[5].kind = 'unsupported' },
  ]) { const copy = structuredClone(program); mutation(copy); assert.throws(() => parseProgram(copy, workflow)) }
  assert.throws(() => validateData(JSON.parse('{"__proto__":{"polluted":true}}')))
  assert.throws(() => validateData({ value: 'x'.repeat(33000) }))
  assert.equal(({} as { polluted?: boolean }).polluted, undefined)
  assert.ok(!availableFields({ order: { id: 'private-id-value' } }).some((field) => JSON.stringify(field).includes('private-id-value')))
})

test('compiler and repair transports omit private input values, endpoint URLs and credential references; each uses one bounded request', async () => {
  const h = harness(); let calls = 0
  const send: typeof fetch = async (_url, options) => {
    calls++; const body = JSON.parse(String(options?.body))
    assert.equal(body.store, false); assert.equal(body.text.format.strict, true)
    assert.ok(!String(options?.body).includes('receiver.example.com')); assert.ok(!String(options?.body).includes('notify_token')); assert.ok(!String(options?.body).includes('private-value'))
    assert.equal(body.max_output_tokens, calls === 1 ? 6144 : 1536)
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(calls === 1 ? h.program : { title: 'Map identifier', explanation: 'Existing field.', sourcePath: 'order.id', targetPath: 'order.legacy_id' }) }] }] })
  }
  await createMuseCompiler({ getKey: async () => 'fake-key', send })(h.workflow, new AbortController().signal)
  const started = await h.start(); await h.service.drain(); const run = await h.service.get(started.id)
  run.context = { order: { id: 'private-value' } }
  await createMuseRepairer({ getKey: async () => 'fake-key', send })(run, new AbortController().signal)
  assert.equal(calls, 2)
})

test('run APIs validate requests, return durable history, and reject cross-origin mutations', async (t) => {
  const h = harness(); const app = buildApp({ repository: h.workflows, execution: h.service }); t.after(() => app.close())
  const url = '/api/workflows/' + h.workflow.id + '/runs'; const request = { requestId: randomUUID(), expectedVersion: 1, input: validInput }
  assert.equal((await app.inject({ method: 'POST', url, payload: { ...request, expectedVersion: '1' } })).statusCode, 400)
  assert.equal((await app.inject({ method: 'POST', url, payload: request, headers: { origin: 'https://evil.example' } })).statusCode, 403)
  assert.equal(h.calls().compileCalls, 0)
  const response = await app.inject({ method: 'POST', url, payload: request }); assert.equal(response.statusCode, 202)
  await h.service.drain()
  assert.equal((await app.inject('/api/runs/' + request.requestId)).json().run.status, 'succeeded')
  const list = (await app.inject(url)).json().runs; assert.equal(list.length, 1); assert.equal(list[0].totalSteps, 6); assert.equal(list[0].input, undefined)
})

test('restart recovery marks interrupted work uncertain and preserves prior attempts without repeating AI or HTTP', async () => {
  const h = harness(); const started = await h.start(); await h.service.drain(); const run = await h.service.get(started.id)
  run.status = 'running'; run.steps[4].status = 'running'; run.steps[4].attempts[0].status = 'running'
  await h.runs.update(run, run.revision)
  const before = h.sends.length; await h.service.recover()
  const recovered = await h.service.get(run.id); assert.equal(recovered.status, 'unknown'); assert.equal(recovered.steps[4].status, 'unknown'); assert.equal(h.sends.length, before)
})

test('enabled automatic repair creates one verified proposal and waits for approval before resuming', async () => {
  const h = harness(); h.program.steps[3].requiredPaths = ['order.legacy_id']
  const started = await h.service.start(h.workflow.id, { requestId: randomUUID(), expectedVersion: 1, input: validInput, autoRepair: true })
  await h.service.drain()
  const run = await h.service.get(started.id)
  assert.equal(run.status, 'failed'); assert.equal(run.repairs.length, 1); assert.equal(run.repairs[0].status, 'proposed')
  assert.equal(h.calls().repairCalls, 1); assert.equal(h.sends.length, 0)
  assert.equal(readPath(run.context, 'order.legacy_id'), undefined)
})

test('cancellation finishes an in-flight delivery once and stops later side effects', async () => {
  const h = harness(); const ids = ['input', 'approve', 'enrich', 'reject']
  h.workflow.plan.steps = h.workflow.plan.steps.filter((step) => ids.includes(step.id)); h.workflow.diagram.nodes = h.workflow.diagram.nodes.filter((step) => ids.includes(step.id))
  const edges = [{ id: 'a', source: 'input', target: 'approve' }, { id: 'b', source: 'approve', target: 'enrich' }, { id: 'c', source: 'enrich', target: 'reject' }]
  h.workflow.plan.edges = edges; h.workflow.diagram.edges = edges
  h.program.steps = [executable('input', 'input'), executable('approve', 'webhook'), h.program.steps[3], executable('reject', 'webhook')]
  let release!: () => void; let began!: () => void
  const wait = new Promise<void>((resolve) => { release = resolve }); const started = new Promise<void>((resolve) => { began = resolve })
  const service = createExecutionService({ workflows: h.workflows, runs: h.runs, compile: h.compile, delivery: { ...h.delivery, deliver: async (...args) => { began(); await wait; return h.delivery.deliver(args[0], args[1], args[2]) } } })
  const run = await service.start(h.workflow.id, { requestId: randomUUID(), expectedVersion: 1, input: validInput })
  await started; await service.cancel(run.id); release(); await service.drain()
  const cancelled = await service.get(run.id)
  assert.equal(cancelled.status, 'cancelled'); assert.deepEqual(h.sends.map((send) => send.hook), ['approve'])
  assert.equal(cancelled.steps.find((step) => step.stepId === 'approve')?.status, 'succeeded')
  assert.equal(cancelled.steps.find((step) => step.stepId === 'reject')?.attempts.length, 0)
})

test('a repair cannot invalidate a validation result or branch decision that already completed', async () => {
  const h = harness()
  // Validation observes the missing id and chooses rejection; adding it later would make that decision stale.
  const input = { order: { order_id: 'original-id', total: 12000, currency: 'PHP' } }
  const started = await h.service.start(h.workflow.id, { requestId: randomUUID(), expectedVersion: 1, input }); await h.service.drain()
  const failed = await h.service.get(started.id); assert.equal(failed.failure?.missingPath, 'order.id')
  const service = createExecutionService({ workflows: h.workflows, runs: h.runs, delivery: h.delivery, repair: async () => ({ title: 'Add id', explanation: 'Use the renamed id.', sourcePath: 'order.order_id', targetPath: 'order.id' }) })
  await service.proposeRepair(failed.id, randomUUID(), failed.revision); await service.drain()
  const blocked = await service.get(failed.id)
  assert.equal(blocked.repairs[0].status, 'unavailable'); assert.equal(blocked.repairs[0].checks[2].passed, false)
  assert.equal(h.sends.length, 0); assert.equal(readPath(blocked.context, 'order.id'), undefined)
})

test('provider expression-root prefixes resolve only to proven saved fields and preserve genuine data roots', () => {
  const { workflow, program } = executionFixture()
  workflow.plan.steps[0].outputs = [{ name: 'order.id', description: '' }, { name: 'order.currency', description: '' }, { name: 'order.total', description: '' }]
  program.steps[3].assignments[1].template = '{{data.order.id}} total {{context.order.total}} {{data.order.currency}}'
  const original = structuredClone(program)
  const parsed = parseProgram(program, workflow)
  const result = executeLocalStep(parsed.steps[3], validInput)
  assert.equal(readPath(result.context, 'order.summary'), 'order-1 total 12500 PHP')
  assert.deepEqual(program, original)
  workflow.plan.steps[0].outputs.push({ name: 'data.order.id', description: 'An actual nested source field.' })
  const explicit = parseProgram(program, workflow)
  assert.ok(explicit.steps[3].assignments[1].template.includes('{{data.order.id}}'))
})
