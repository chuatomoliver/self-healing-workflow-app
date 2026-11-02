import type { PlanWebhookTemplate, WebhookConnectionState } from './types.ts'

// AI suggestions cannot be promoted to a connection by the sample UI adapter.
export function webhookReviewState(template: PlanWebhookTemplate, connection: WebhookConnectionState[string]) {
  if (template.suggestedBy === 'muse') return 'needs-setup'
  return connection === 'connected-demo' ? 'connected-demo' : 'suggested'
}

export function canConnectWebhookDemo(template: PlanWebhookTemplate): boolean {
  return template.suggestedBy !== 'muse'
}
