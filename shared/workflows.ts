// Transport contracts for saved drafts. These are not executable engine definitions.
export type DiagramNodeRole = 'trigger' | 'transform' | 'decision' | 'action'
export type DiagramNode = {
  id: string
  label: string
  role: DiagramNodeRole
  description: string
  app?: string
  reviewNote?: string
  position: { x: number; y: number }
}
export type DiagramEdge = { id: string; source: string; target: string; label?: string }
export type ParsedDiagram = { id: string; title: string; summary: string; nodes: DiagramNode[]; edges: DiagramEdge[] }
export type PlanField = { name: string; description: string }
export type PlanMapping = { source: string; target: string }
export type PlanSetting = { label: string; value: string; needsInput?: boolean }
export type PlanStepConfiguration = {
  reviewed?: boolean
  configuredBy?: 'muse'
  operation: string
  webhookTemplateId?: string
  inputs: PlanField[]
  outputs: PlanField[]
  configuration: PlanSetting[]
  mappings: PlanMapping[]
}
export type PlanStep = PlanStepConfiguration & { id: string; title: string; role: DiagramNodeRole; description: string }
export type PlanWebhookTemplate = {
  suggestedBy?: 'muse'
  configuredBy?: 'muse'
  connectionId?: string
  setup?: { endpointReviewed: boolean; authenticationReviewed: boolean; payloadReviewed: boolean }
  id: string
  name: string
  direction: 'incoming' | 'outgoing'
  method: 'POST'
  event: string
  purpose: string
  suggestionReason: string
  endpoint: { kind: 'managed' | 'external'; urlTemplate: string }
  authentication: { type: 'signature' | 'secret-header'; headerName: string; secretRef: string }
  payloadTemplate: Record<string, string>
}
export type PlanQuestion = { id: string; stepId: string; question: string; explanation: string; answer?: string }
export type PlanCheck = { id: string; title: string; description: string; status: 'pending' | 'needs-input' | 'not-run' | 'reviewed' | 'configured' }
export type WorkflowPlan = {
  generatedBy?: 'muse'
  configurationMode?: 'automatic'
  structureReviewed?: boolean
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
export type WorkflowDraft = { plan: WorkflowPlan; diagram: ParsedDiagram; prompt: string }
export type SavedWorkflow = WorkflowDraft & { id: string; version: number; createdAt: string; updatedAt: string }
export type WorkflowSummary = Pick<SavedWorkflow, 'id' | 'version' | 'createdAt' | 'updatedAt'> & { title: string }
export type UpdateWorkflowRequest = { expectedVersion: number; draft: WorkflowDraft }
export type ApiErrorResponse = { error: { code: string; message: string; requestId: string } }
