import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { WebhookConnection } from '../../../shared/connections.ts'
import type { WorkflowPlan } from '../../../shared/workflows.ts'
import { webhookAuthenticationIssue, webhookEndpointIssue } from '../../../shared/setup.ts'
import { ApiError } from '../errors.ts'

export const connectionFile = (env: NodeJS.ProcessEnv = process.env) => env.WEBHOOK_CONNECTIONS_FILE
  || join(env.LOCALAPPDATA || join(homedir(), '.config'), 'Metaflow', 'connections.json')

export function parseConnections(value: unknown): WebhookConnection[] {
  const fail = (): never => { throw new ApiError(503, 'CONNECTIONS_UNAVAILABLE', 'The saved connections file is invalid. Check backend connection setup.') }
  if (!Array.isArray(value) || value.length > 20) return fail()
  const ids = new Set<string>()
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)
      || !['authentication,description,endpointUrl,id,name', 'authentication,description,endpointUrl,id,name,slackChannel'].includes(Object.keys(item).sort().join(','))
      || typeof item.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(item.id) || ids.has(item.id)
      || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 200
      || typeof item.description !== 'string' || item.description.length > 1000
      || typeof item.endpointUrl !== 'string' || item.endpointUrl.length > 2048
      || !item.authentication || typeof item.authentication !== 'object' || Array.isArray(item.authentication)
      || Object.keys(item.authentication).sort().join(',') !== 'headerName,secretRef,type'
      || !['signature', 'secret-header', 'slack-webhook', 'stored-webhook'].includes(item.authentication.type)
      || typeof item.authentication.headerName !== 'string' || typeof item.authentication.secretRef !== 'string') return fail()
    if (item.authentication.type === 'slack-webhook' ? typeof item.slackChannel !== 'string' || !/^#[a-zA-Z0-9_-]{1,80}$/.test(item.slackChannel) : Object.hasOwn(item, 'slackChannel')) return fail()
    const template = { endpoint: { urlTemplate: item.endpointUrl }, authentication: item.authentication }
    // Both validators only access the properties supplied above.
    if (webhookEndpointIssue(template as Parameters<typeof webhookEndpointIssue>[0])
      || webhookAuthenticationIssue(template as Parameters<typeof webhookAuthenticationIssue>[0])) return fail()
    ids.add(item.id)
  }
  return structuredClone(value) as WebhookConnection[]
}

let saving: Promise<void> = Promise.resolve()
export function saveConnection(connection: WebhookConnection, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const update = saving.then(async () => {
    const existing = await loadConnections(env)
    const next = parseConnections([...existing.filter((item) => item.id !== connection.id), connection])
    const file = connectionFile(env)
    const temporary = `${file}.${randomUUID()}.tmp`
    await mkdir(dirname(file), { recursive: true })
    try {
      await writeFile(temporary, JSON.stringify(next, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
      await rename(temporary, file)
    } finally { await rm(temporary, { force: true }) }
  })
  saving = update.catch(() => {})
  return update
}

export async function loadConnections(env: NodeJS.ProcessEnv = process.env): Promise<WebhookConnection[]> {
  try {
    const content = await readFile(connectionFile(env), 'utf8')
    if (Buffer.byteLength(content) > 65536) throw new Error('Too large')
    return parseConnections(JSON.parse(content))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw new ApiError(503, 'CONNECTIONS_UNAVAILABLE', 'The backend could not load saved connections. Check backend connection setup.')
  }
}

// Machine-configured metadata never authorizes a caller-supplied destination.
export function validateConnectionBindings(plan: WorkflowPlan, connections: WebhookConnection[]) {
  for (const hook of plan.webhooks) {
    if (!hook.connectionId && !hook.configuredBy) continue
    const connection = connections.find((item) => item.id === hook.connectionId)
    if (!connection || hook.direction !== 'outgoing' || hook.endpoint.kind !== 'external'
      || hook.endpoint.urlTemplate !== connection.endpointUrl
      || hook.authentication.type !== connection.authentication.type
      || hook.authentication.headerName !== connection.authentication.headerName
      || hook.authentication.secretRef !== connection.authentication.secretRef) {
      throw new ApiError(400, 'CONNECTION_CHANGED', 'A saved connection is missing or changed. Update setup with Muse before saving or sending.')
    }
  }
}
