import assert from 'node:assert/strict'
import test from 'node:test'
import { samplePlan } from '../src/features/workflows/data/samplePlan.ts'
import { sampleScenarios } from '../src/features/canvas/data/sampleScenarios.ts'
import { createDemoFrames } from '../src/features/canvas/demoPlayback.ts'
import { applyRepairToPlan, createRepairProposal, createRepairReplay, verifyRepair } from '../src/features/healing/repair.ts'
import { emptyHistory, filterRuns, recordRepair, recordRun } from '../src/features/history/journal.ts'
import { formatHistoryTime, formatRunDuration } from '../src/features/history/presentation.ts'
import type { RepairReview } from '../src/features/healing/types.ts'

const frames = createDemoFrames(samplePlan.steps.map((step) => step.id), sampleScenarios[2])
const failed = frames.at(-1)!
const context = { plan: samplePlan, prompt: 'Route support requests.', diagram: null }
const snapshot = { runId: 'run-001', scenarioLabel: sampleScenarios[2].label, frame: failed }
const start = '2026-10-30T00:00:00.000Z'
const end = '2026-10-30T00:00:04.000Z'

test('updates one attempt during playback and deduplicates repeated effect observations', () => {
  let history = recordRun(emptyHistory(), 'run-001', 'Urgent request', frames[0], context, start)
  assert.equal(recordRun(history, 'run-001', 'Urgent request', frames[0], context, end), history)
  history = recordRun(history, 'run-001', 'Urgent request', failed, context, end)
  assert.equal(history.runs.length, 1)
  assert.equal(history.runs[0].frame.status, 'failed')
  assert.equal(history.runs[0].startedAt, start)
  assert.equal(history.runs[0].finishedAt, end)
})

test('archives replay separately and retains the original failure and pre-repair configuration', () => {
  const proposal = createRepairProposal(samplePlan, snapshot)!
  const updatedPlan = applyRepairToPlan(samplePlan, proposal)
  const [replaying, completed] = createRepairReplay(snapshot, proposal)
  let history = recordRun(emptyHistory(), 'run-001', 'Urgent request', frames[0], context, start)
  history = recordRun(history, 'run-001', 'Urgent request', failed, context, end)
  const original = history.runs[0]
  history = recordRun(history, 'run-001', 'Resumed execution', replaying, { ...context, plan: updatedPlan }, '2026-10-30T00:00:05.000Z')
  history = recordRun(history, 'run-001', 'Resumed execution', completed, { ...context, plan: updatedPlan }, '2026-10-30T00:00:06.000Z')
  assert.equal(history.runs.length, 2)
  assert.equal(history.runs[0].attempt, 2)
  assert.equal(history.runs[0].frame.status, 'succeeded')
  assert.equal(history.runs[1], original)
  assert.equal(original.frame.outputs.n4.statusCode, 400)
  assert.equal(original.context.plan.webhooks[1].payloadTemplate.heading, '{{request.subject}}')
  assert.equal(history.runs[0].context.plan.webhooks[1].payloadTemplate.title, '{{request.subject}}')
})

test('recorded context and outputs cannot change through later edits to the source objects', () => {
  const sourceFrame = structuredClone(failed)
  const sourceContext = structuredClone(context)
  const history = recordRun(emptyHistory(), 'run-001', 'Urgent request', sourceFrame, sourceContext, start)
  sourceFrame.outputs.n4.statusCode = 202
  sourceContext.plan.steps[0].title = 'Changed later'
  sourceContext.prompt = 'A new description'
  assert.equal(history.runs[0].frame.outputs.n4.statusCode, 400)
  assert.equal(history.runs[0].context.plan.steps[0].title, 'New support request')
  assert.equal(history.runs[0].context.prompt, 'Route support requests.')
})

test('keeps rejection, reopening, verification, and application in a durable decision timeline', () => {
  const proposal = createRepairProposal(samplePlan, snapshot)!
  const checks = verifyRepair(proposal)
  let review: RepairReview = { snapshot, decision: 'review', checks: null, proposal: null }
  let history = recordRepair(emptyHistory(), review, 'Notify the on-call team', start)
  assert.equal(recordRepair(history, review, 'Notify the on-call team', end), history)
  review = { ...review, checks, proposal }
  history = recordRepair(history, review, 'Notify the on-call team', end)
  review = { ...review, decision: 'rejected' }
  history = recordRepair(history, review, 'Notify the on-call team', end)
  review = { ...review, decision: 'review', checks: null, proposal: null }
  history = recordRepair(history, review, 'Notify the on-call team', end)
  review = { ...review, checks, proposal }
  history = recordRepair(history, review, 'Notify the on-call team', end)
  review = { ...review, decision: 'applied' }
  history = recordRepair(history, review, 'Notify the on-call team', end)
  assert.equal(history.repairs.length, 1)
  assert.deepEqual(history.repairs[0].events.map((event) => event.kind), ['opened', 'verified', 'rejected', 'reopened', 'verified', 'applied'])
  assert.equal(history.repairs[0].events[2].proposal!.originalField, 'heading')
  assert.equal(history.repairs[0].decision, 'applied')
  const newer = recordRun(history, 'run-002', 'Another request', frames[0], context, end)
  assert.equal(newer.repairs, history.repairs)
})

test('failed verification is retained as a failed check rather than a passed repair', () => {
  const review: RepairReview = { snapshot, decision: 'review', checks: [{ id: 'schema', title: 'Required fields', passed: false, detail: 'Missing title.' }], proposal: null }
  const history = recordRepair(emptyHistory(), review, 'Notify the on-call team', start)
  assert.equal(history.repairs[0].events[0].kind, 'verification-failed')
  assert.equal(history.repairs[0].checks![0].passed, false)
})

test('search combines case-insensitive input/step matching with the selected status', () => {
  let history = recordRun(emptyHistory(), 'run-001', 'Urgent request', failed, context, start)
  const success = createDemoFrames(samplePlan.steps.map((step) => step.id), sampleScenarios[1]).at(-1)!
  history = recordRun(history, 'run-002', 'Standard request', success, context, end)
  assert.deepEqual(filterRuns(history.runs, '  URGENT  ', 'all').map((run) => run.runId), ['run-001'])
  assert.deepEqual(filterRuns(history.runs, 'on-call', 'succeeded').map((run) => run.runId), ['run-002'])
  assert.equal(filterRuns(history.runs, 'run-002', 'failed').length, 0)
  assert.equal(filterRuns(history.runs, '', 'all').length, 2)
})

test('formats actual attempt duration and renders timestamps in Manila time', () => {
  assert.equal(formatRunDuration(start, end), '4.0s')
  assert.equal(formatRunDuration(start, null), 'In progress')
  assert.equal(formatRunDuration(end, start), '0.0s')
  assert.equal(formatRunDuration(start, '2026-10-30T00:01:05.000Z'), '1m 5s')
  assert.match(formatHistoryTime(start), /08:00:00/)
})
