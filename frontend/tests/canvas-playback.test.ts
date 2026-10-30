import assert from 'node:assert/strict'
import test from 'node:test'
import { sampleScenarios } from '../src/features/canvas/data/sampleScenarios.ts'
import { createDemoFrames, stopDemoFrame } from '../src/features/canvas/demoPlayback.ts'

const stepIds = ['n1', 'n2', 'n3', 'n4', 'n5']

test('urgent sample plays the on-call branch without producing queue output', () => {
  const frames = createDemoFrames(stepIds, sampleScenarios[0])
  const final = frames.at(-1)!
  assert.equal(final.status, 'succeeded')
  assert.equal(final.stepStates.n4, 'succeeded')
  assert.equal(final.stepStates.n5, 'skipped')
  assert.equal(final.outputs.n3.route, 'urgent')
  assert.equal(final.outputs.n5, undefined)
  assert.equal(final.events.some((event) => event.stepId === 'n5'), false)
})

test('standard sample selects the queue and never plays the on-call action', () => {
  const final = createDemoFrames(stepIds, sampleScenarios[1]).at(-1)!
  assert.equal(final.status, 'succeeded')
  assert.equal(final.stepStates.n4, 'skipped')
  assert.equal(final.stepStates.n5, 'succeeded')
  assert.equal(final.outputs.n3.route, 'standard')
  assert.equal(final.outputs.n4, undefined)
})

test('a failed step preserves its error and never plays later results', () => {
  const scenario = sampleScenarios[2]
  const final = createDemoFrames(stepIds, {
    ...scenario,
    results: [...scenario.results, { stepId: 'n5', message: 'Must not play after failure.', output: {} }],
  }).at(-1)!
  assert.equal(final.status, 'failed')
  assert.equal(final.failure?.stepId, 'n4')
  assert.equal(final.outputs.n4.statusCode, 400)
  assert.equal(final.stepStates.n5, 'idle')
  assert.equal(final.outputs.n5, undefined)
  assert.equal(final.events.some((event) => event.stepId === 'n5'), false)
})

test('stopping playback preserves completed results and leaves future steps unplayed', () => {
  const frames = createDemoFrames(stepIds, sampleScenarios[0])
  const active = frames.find((frame) => frame.stepStates.n2 === 'running')!
  const stopped = stopDemoFrame(active)
  assert.equal(stopped.status, 'stopped')
  assert.equal(stopped.stepStates.n1, 'succeeded')
  assert.equal(stopped.stepStates.n2, 'stopped')
  assert.equal(stopped.stepStates.n3, 'idle')
  assert.equal(stopped.outputs.n2, undefined)
  assert.equal(active.stepStates.n2, 'running')
  assert.equal(stopDemoFrame(frames.at(-1)!), frames.at(-1))
})

test('later frames do not overwrite the earlier visible state or log', () => {
  const frames = createDemoFrames(stepIds, sampleScenarios[0])
  assert.equal(frames[0].stepStates.n1, 'running')
  assert.equal(frames[0].events.length, 1)
  assert.deepEqual(frames[0].outputs, {})
  assert.equal(frames.at(-1)!.stepStates.n1, 'succeeded')
})

test('rejects empty paths and fixtures with unknown or repeated step IDs', () => {
  const scenario = sampleScenarios[0]
  for (const results of [[], [{ ...scenario.results[0], stepId: 'unknown' }], [scenario.results[0], scenario.results[0]]]) {
    assert.throws(() => createDemoFrames(stepIds, { ...scenario, results }), /known steps/)
  }
})
