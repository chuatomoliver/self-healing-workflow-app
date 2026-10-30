import type { DemoRunFrame, DemoScenario } from './types'

export function createDemoFrames(stepIds: string[], scenario: DemoScenario): DemoRunFrame[] {
  const path = scenario.results.map((result) => result.stepId)
  if (!path.length || new Set(path).size !== path.length || path.some((id) => !stepIds.includes(id))) {
    throw new Error('Run results must reference a non-empty sequence of unique, known steps.')
  }

  let current: DemoRunFrame = {
    status: 'running',
    stepStates: Object.fromEntries(stepIds.map((id) => [id, path.includes(id) ? 'idle' : 'skipped'])),
    events: [], outputs: {},
  }
  const frames: DemoRunFrame[] = []

  for (const [index, result] of scenario.results.entries()) {
    current = {
      ...current,
      stepStates: { ...current.stepStates, [result.stepId]: 'running' },
      events: [...current.events, { stepId: result.stepId, level: 'info', message: 'Step started.' }],
    }
    frames.push(current)
    current = {
      ...current,
      status: result.error ? 'failed' : index === scenario.results.length - 1 ? 'succeeded' : 'running',
      stepStates: { ...current.stepStates, [result.stepId]: result.error ? 'failed' : 'succeeded' },
      events: [...current.events, { stepId: result.stepId, level: result.error ? 'error' : 'success', message: result.message }],
      outputs: { ...current.outputs, [result.stepId]: result.output },
      ...(result.error ? { failure: { stepId: result.stepId, message: result.error } } : {}),
    }
    frames.push(current)
    if (result.error) break
  }

  return frames
}

export function stopDemoFrame(frame: DemoRunFrame): DemoRunFrame {
  if (frame.status !== 'running') return frame
  const activeId = Object.keys(frame.stepStates).find((id) => frame.stepStates[id] === 'running')
  return {
    ...frame, status: 'stopped',
    stepStates: Object.fromEntries(Object.entries(frame.stepStates).map(([id, state]) => [id, state === 'running' ? 'stopped' : state])),
    events: [...frame.events, { stepId: activeId ?? 'run', level: 'info', message: 'Run stopped.' }],
  }
}
