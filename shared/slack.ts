import type { WebhookConnection } from './connections.ts'

// The real, secret-bearing URL is resolved from the credential store at delivery.
export const SLACK_ENDPOINT = 'https://hooks.slack.com/services'
export const SLACK_REFERENCE_HEADER = 'X-Slack-Webhook'
export type SlackSetupRequest = { name: string; channel: string; webhookUrl: string }
export type SlackSetupResult = { connection: WebhookConnection; channel: string }

export function validSlackWebhookUrl(value: string): boolean {
  return value.length <= 2048 && /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(value)
}
