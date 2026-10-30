import type { DiagramEdge, DiagramNodeRole } from '../diagram-parsing/types'

export type PlanField = { name: string; description: string }
export type PlanMapping = { source: string; target: string }
export type PlanSetting = { label: string; value: string; needsInput?: boolean }

export type PlanStepConfiguration = {
  operation: string
  webhookTemplateId?: string
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

// Suggested contracts only. URLs are placeholders; credentials belong on the server.
export type PlanWebhookTemplate = {
  id: string
  name: string
  direction: 'incoming' | 'outgoing'
  method: 'POST'
  event: string
  purpose: string
  suggestionReason: string
  endpoint: { kind: 'managed' | 'external'; urlTemplate: string }
  authentication: {
    type: 'signature' | 'secret-header'
    headerName: string
    secretRef: string
  }
  payloadTemplate: Record<string, string>
}

// Local UI state is separate from the suggested plan, never proof of a live connection.
export type WebhookConnectionState = Record<string, 'connected-demo' | undefined>

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
  status: 'pending' | 'needs-input' | 'not-run'
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
  webhooks: PlanWebhookTemplate[]
  questions: PlanQuestion[]
  checks: PlanCheck[]
}
