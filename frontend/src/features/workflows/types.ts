import type { DiagramEdge, DiagramNodeRole } from '../diagram-parsing/types'

export type PlanField = { name: string; description: string }
export type PlanMapping = { source: string; target: string }
export type PlanSetting = { label: string; value: string; needsInput?: boolean }

export type PlanStepConfiguration = {
  operation: string
  connectionId?: string
  inputs: PlanField[]
  outputs: PlanField[]
  configuration: PlanSetting[]
  mappings: PlanMapping[]
}

export type PlanStep = PlanStepConfiguration & {
  id: string
  title: string
  role: DiagramNodeRole
  description: string
}

export type PlanConnection = {
  id: string
  provider: string
  purpose: string
  permissions: string[]
}

export type PlanQuestion = {
  id: string
  stepId: string
  question: string
  explanation: string
}

export type PlanCheck = {
  id: string
  title: string
  description: string
  status: 'sample' | 'pending' | 'needs-input' | 'not-run'
}

// Frontend sample/view model; this is not an executable engine definition.
export type WorkflowPlan = {
  id: string
  sourceDiagramId: string
  title: string
  summary: string
  expectedOutcome: string
  steps: PlanStep[]
  edges: DiagramEdge[]
  connections: PlanConnection[]
  questions: PlanQuestion[]
  checks: PlanCheck[]
}
