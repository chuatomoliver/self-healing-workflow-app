import assert from 'node:assert/strict'
import test from 'node:test'
import { createDemoFrames } from '../src/features/canvas/demoPlayback.ts'
import { getSampleScenarios, sampleScenarios } from '../src/features/canvas/data/sampleScenarios.ts'
import { samplePlan } from '../src/features/workflows/data/samplePlan.ts'
import { applyRepairToPlan, createRepairProposal, createRepairReplay, verifyRepair } from '../src/features/healing/repair.ts'

const frame = createDemoFrames(samplePlan.steps.map((step) => step.id), sampleScenarios[2]).at(-1)!
const snapshot = { runId: 'run-001', scenarioLabel: sampleScenarios[2].label, frame }

test('builds a bounded field-rename proposal from the failed response and upstream values', () => {
  const proposal = createRepairProposal(samplePlan, snapshot)!
  assert.equal(proposal.stepId, 'n4')
  assert.equal(proposal.originalPayload.heading, frame.outputs.n2.subject)
  assert.equal(proposal.repairedPayload.title, frame.outputs.n2.subject)
  assert.equal(proposal.repairedPayload.body, frame.outputs.n2.text)
  assert.equal(proposal.repairedPayload.heading, undefined)
  assert.equal(proposal.repairedTemplate.title, '{{request.subject}}')
  assert.equal(proposal.response, frame.outputs.n4)
})

test('does not invent a repair for a different failure or missing upstream data', () => {
  assert.equal(createRepairProposal(samplePlan, { ...snapshot, frame: { ...frame, status: 'succeeded' } }), null)
  assert.equal(createRepairProposal(samplePlan, { ...snapshot, frame: { ...frame, failure: { stepId: 'n5', message: 'Another failure.' } } }), null)
  assert.equal(createRepairProposal(samplePlan, { ...snapshot, frame: { ...frame, outputs: { n4: frame.outputs.n4 } } }), null)
  assert.equal(createRepairProposal(samplePlan, { ...snapshot, frame: { ...frame, outputs: { ...frame.outputs, n4: { statusCode: 401 } } } }), null)
})

test('verification rejects missing required values, data loss, and inconsistent mappings', () => {
  const proposal = createRepairProposal(samplePlan, snapshot)!
  assert.equal(verifyRepair(proposal).every((check) => check.passed), true)
  const checks = verifyRepair({ ...proposal, repairedPayload: { ...proposal.repairedPayload, title: '', body: 'Changed body' }, repairedMappings: [] })
  assert.equal(checks.find((check) => check.id === 'schema')?.passed, false)
  assert.equal(checks.find((check) => check.id === 'rename')?.passed, false)
  assert.equal(checks.find((check) => check.id === 'integrity')?.passed, false)
  assert.equal(checks.find((check) => check.id === 'mapping')?.passed, false)
})

test('applies only the reviewed mapping and webhook template without mutating the source plan', () => {
  const before = JSON.stringify(samplePlan)
  const proposal = createRepairProposal(samplePlan, snapshot)!
  const updated = applyRepairToPlan(samplePlan, proposal)
  assert.equal(JSON.stringify(samplePlan), before)
  assert.equal(updated.webhooks.find((webhook) => webhook.id === 'on-call-alert')!.payloadTemplate.heading, undefined)
  assert.equal(updated.webhooks.find((webhook) => webhook.id === 'on-call-alert')!.payloadTemplate.title, '{{request.subject}}')
  assert.equal(updated.steps.find((step) => step.id === 'n4')!.mappings[0].target, 'webhook.payload.title')
  assert.equal(updated.steps.find((step) => step.id === 'n5'), samplePlan.steps.find((step) => step.id === 'n5'))
  assert.equal(updated.webhooks[0], samplePlan.webhooks[0])
  assert.throws(() => applyRepairToPlan(updated, proposal), /no longer matches/)
})

test('resumes the failed delivery without replaying successful steps or the skipped branch', () => {
  const proposal = createRepairProposal(samplePlan, snapshot)!
  const [running, completed] = createRepairReplay(snapshot, proposal)
  assert.equal(running.stepStates.n4, 'running')
  assert.equal(running.outputs.n4, undefined)
  assert.equal(completed.status, 'succeeded')
  assert.equal(completed.failure, undefined)
  assert.equal(completed.outputs.n4.statusCode, 202)
  assert.deepEqual(completed.outputs.n4.payload, proposal.repairedPayload)
  for (const id of ['n1', 'n2', 'n3']) {
    assert.equal(completed.stepStates[id], 'succeeded')
    assert.equal(completed.outputs[id], frame.outputs[id])
  }
  assert.equal(completed.stepStates.n5, 'skipped')
  assert.deepEqual(completed.events.slice(0, frame.events.length), frame.events)
  assert.equal(completed.events.slice(frame.events.length).every((event) => event.stepId === 'n4'), true)
  assert.equal(frame.stepStates.n4, 'failed')
})

test('does not mark a run recovered while required steps are unfinished', () => {
  const proposal = createRepairProposal(samplePlan, snapshot)!
  assert.throws(() => createRepairReplay({ ...snapshot, frame: { ...frame, stepStates: { ...frame.stepStates, n2: 'idle' } } }, proposal), /required to resume/)
  assert.throws(() => createRepairReplay(snapshot, { ...proposal, repairedPayload: {} }), /required to resume/)
})

test('subsequent fixture runs honor an applied repair and preserve the original failure fixture', () => {
  const proposal = createRepairProposal(samplePlan, snapshot)!
  const updated = applyRepairToPlan(samplePlan, proposal)
  const scenario = getSampleScenarios(updated).find((item) => item.id === 'urgent-failure')!
  assert.equal(createDemoFrames(updated.steps.map((step) => step.id), scenario).at(-1)!.status, 'succeeded')
  assert.equal(sampleScenarios[2].results.at(-1)!.output.statusCode, 400)
  assert.equal(getSampleScenarios(samplePlan), sampleScenarios)
})
