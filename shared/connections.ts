import type { PlanWebhookTemplate } from './workflows.ts'

// Only the name and purpose are sent to Muse. Addresses and credential references stay on the backend.
export type WebhookConnection = {
  id: string
  name: string
  description: string
  endpointUrl: string
  authentication: PlanWebhookTemplate['authentication']
}
export type ConnectionSummary = Pick<WebhookConnection, 'id' | 'name' | 'description'>
export const connectionSummaries = (connections: WebhookConnection[]): ConnectionSummary[] =>
  connections.map(({ id, name, description }) => ({ id, name, description }))
