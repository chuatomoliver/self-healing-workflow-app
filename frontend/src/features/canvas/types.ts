export type CanvasPosition = { x: number; y: number }
export type CanvasPositions = Record<string, CanvasPosition>
export type CanvasStepStatus = 'idle' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'stopped'

export type DemoStepResult = {
  stepId: string
  message: string
  output: Record<string, unknown>
  error?: string
}

// Fixture playback, not instructions for executing a real workflow.
export type DemoScenario = {
  id: string
  label: string
  description: string
  results: DemoStepResult[]
}

export type DemoRunEvent = { stepId: string; level: 'info' | 'success' | 'error'; message: string }
export type DemoRunFrame = {
  status: 'running' | 'succeeded' | 'failed' | 'stopped'
  stepStates: Record<string, CanvasStepStatus>
  events: DemoRunEvent[]
  outputs: Record<string, Record<string, unknown>>
  failure?: { stepId: string; message: string }
}
