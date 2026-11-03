import type { PlanWebhookTemplate } from './workflows.ts'

// Only the name and purpose are sent to Muse. Addresses and credential references stay on the backend.
export type WebhookConnection = {
  id: string
  name: string
  description: string
  endpointUrl: string
  authentication: PlanWebhookTemplate['authentication']
  slackChannel?: string
}
export type ConnectionSummary = Pick<WebhookConnection, 'id' | 'name' | 'description'>
export type WebhookConnectionRequest = { name: string; url: string; mode: 'url' | 'secret-header' | 'signature'; headerName: string; secret: string }
export const STORED_WEBHOOK_HEADER = 'X-Webhook-Reference'
export const connectionSummaries = (connections: WebhookConnection[]): ConnectionSummary[] =>
  connections.map(({ id, name, description }) => ({ id, name, description }))
