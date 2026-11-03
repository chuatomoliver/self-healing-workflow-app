import { randomUUID } from 'node:crypto'
import { SLACK_ENDPOINT, SLACK_REFERENCE_HEADER, validSlackWebhookUrl } from '../../../shared/slack.ts'
import type { SlackSetupRequest, SlackSetupResult } from '../../../shared/slack.ts'
import { createWindowsCredentialStore } from '../muse/credential-store.ts'
import type { MuseCredentialStore } from '../muse/credential-store.ts'
import { ApiError } from '../errors.ts'
import { saveConnection } from './connections.ts'

export function createSlackSetup(options: {
  env?: NodeJS.ProcessEnv; credentialStore?: (target: string) => MuseCredentialStore
} = {}) {
  return async (input: SlackSetupRequest): Promise<SlackSetupResult> => {
    const name = input.name.trim()
    const channel = input.channel.trim()
    const webhookUrl = input.webhookUrl.trim()
    if (!name || name.length > 200 || !/^#[a-zA-Z0-9_-]{1,80}$/.test(channel) || !validSlackWebhookUrl(webhookUrl))
      throw new ApiError(400, 'SLACK_SETUP_INVALID', 'Enter a connection name, a channel such as #general, and a Slack incoming webhook URL.')
    const id = `slack_${randomUUID()}`
    const store = (options.credentialStore ?? createWindowsCredentialStore)(`Metaflow/Webhook/${id}`)
    const connection = {
      id, name, description: `Send Slack messages to ${channel} using an incoming webhook. The destination channel is fixed by the webhook created in Slack.`,
      endpointUrl: SLACK_ENDPOINT, slackChannel: channel,
      authentication: { type: 'slack-webhook' as const, headerName: SLACK_REFERENCE_HEADER, secretRef: id },
    }
    try { await store.write(webhookUrl) }
    catch { throw new ApiError(503, 'SLACK_CREDENTIAL_UNAVAILABLE', 'Could not save the webhook in Windows Credential Manager. Check that the backend runs under your Windows account.') }
    try { await saveConnection(connection, options.env) }
    catch {
      await store.remove().catch(() => {})
      throw new ApiError(503, 'SLACK_CONNECTION_UNAVAILABLE', 'Could not save the Slack connection. Check the saved connections file and its permissions.')
    }
    return { connection, channel }
  }
}
