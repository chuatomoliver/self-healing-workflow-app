import { randomUUID } from 'node:crypto'
import type { WebhookConnection, WebhookConnectionRequest } from '../../../shared/connections.ts'
import { STORED_WEBHOOK_HEADER } from '../../../shared/connections.ts'
import { SLACK_ENDPOINT, validSlackWebhookUrl } from '../../../shared/slack.ts'
import type { MuseCredentialStore } from '../muse/credential-store.ts'
import { createWebhookCredentialStore } from './credentials.ts'
import { saveConnection } from './connections.ts'
import { readDestinationPolicy } from './destination.ts'
import { ApiError } from '../errors.ts'

export type StoredWebhook = Pick<WebhookConnectionRequest, 'url' | 'mode' | 'headerName' | 'secret'>
export const blockedWebhookHeaders = new Set(['host', 'content-type', 'content-length', 'transfer-encoding', 'connection', 'cookie', 'set-cookie', 'proxy-authorization', 'te', 'trailer', 'upgrade', 'expect', 'keep-alive', 'user-agent', 'x-metaflow-event', 'x-metaflow-delivery-id', 'idempotency-key'])
export function parseStoredWebhook(value: unknown, localReceiverUrl?: string): StoredWebhook {
  const fail = (): never => { throw new ApiError(400, 'CONNECTION_SETUP_INVALID', 'Enter a public HTTPS webhook URL and valid authentication settings.') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail()
  const input = value as StoredWebhook
  if (Object.keys(input).sort().join(',') !== 'headerName,mode,secret,url' || typeof input.url !== 'string' || input.url.length > 2048
    || typeof input.headerName !== 'string' || typeof input.secret !== 'string' || input.secret.length > 1024 || !['url', 'secret-header', 'signature'].includes(input.mode)) return fail()
  let url: URL
  try { url = new URL(input.url) } catch { return fail() }
  if ((url.protocol !== 'https:' && url.href !== localReceiverUrl) || url.username || url.password || url.hash || /[\s{}]/.test(input.url) || url.hostname.endsWith('.invalid')) return fail()
  if (url.hostname === 'hooks.slack.com' && (!validSlackWebhookUrl(input.url) || input.mode !== 'url')) return fail()
  if (input.mode === 'url' ? !!input.headerName || !!input.secret
    : !/^[A-Za-z0-9-]{1,100}$/.test(input.headerName) || blockedWebhookHeaders.has(input.headerName.toLowerCase()) || !/^[\x20-\x7e]+$/.test(input.secret)) return fail()
  return { url: url.href, mode: input.mode, headerName: input.headerName, secret: input.secret }
}
export function createWebhookSetup(options: { env?: NodeJS.ProcessEnv; credentialStore?: (reference: string) => MuseCredentialStore } = {}) {
  const env = options.env ?? process.env
  return async (input: WebhookConnectionRequest): Promise<WebhookConnection> => {
    const name = input.name.trim()
    if (!name || name.length > 200) throw new ApiError(400, 'CONNECTION_SETUP_INVALID', 'Enter a connection name.')
    const settings = parseStoredWebhook({ url: input.url.trim(), mode: input.mode, headerName: input.headerName.trim(), secret: input.secret }, readDestinationPolicy(env).localReceiverUrl)
    const id = `webhook_${randomUUID()}`
    const url = new URL(settings.url)
    const connection: WebhookConnection = {
      id, name, description: `Send JSON notifications to ${url.hostname} using a saved webhook.`,
      endpointUrl: url.hostname === 'hooks.slack.com' ? SLACK_ENDPOINT : `${url.origin}/`,
      authentication: { type: 'stored-webhook', headerName: STORED_WEBHOOK_HEADER, secretRef: id },
    }
    const store = (options.credentialStore ?? ((ref) => createWebhookCredentialStore(ref, env)))(id)
    try { await store.write(JSON.stringify(settings)) }
    catch { throw new ApiError(503, 'CONNECTION_CREDENTIAL_UNAVAILABLE', 'Could not save the connection privately. Check backend credential storage.') }
    try { await saveConnection(connection, env) }
    catch { await store.remove().catch(() => {}); throw new ApiError(503, 'CONNECTIONS_UNAVAILABLE', 'Could not save the connection catalog.') }
    return connection
  }
}
