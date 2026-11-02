import type { DiagramNodeRole, WorkflowDraft } from './workflows.ts'

export const MAX_PARSE_FILE_BYTES = 10 * 1024 * 1024
export const MAX_PARSE_BODY_BYTES = 14 * 1024 * 1024
export const MUSE_PARSE_MODEL = 'muse-spark-1.3'
export type ParseAttachment = { name: string; mimeType: 'image/png' | 'image/jpeg' | 'application/pdf'; data: string }
export type ParseWorkflowRequest = { prompt: string; attachment?: ParseAttachment }
export type ParseWorkflowResponse = { draft: WorkflowDraft; model: typeof MUSE_PARSE_MODEL }
export type WebhookSuggestion = {
  id: string
  stepId: string
  name: string
  direction: 'incoming' | 'outgoing'
  event: string
  purpose: string
  suggestionReason: string
  payloadFields: { name: string; source: string; description: string }[]
}
export type WorkflowExtraction = {
  title: string
  summary: string
  nodes: { id: string; label: string; role: DiagramNodeRole; description: string; app: string; reviewNote: string }[]
  edges: { id: string; source: string; target: string; label: string }[]
  webhooks: WebhookSuggestion[]
}
