import type { ApiErrorResponse, SavedWorkflow, WorkflowDraft, WorkflowSummary } from '../../../../shared/workflows.ts'
import type { SlackSetupRequest, SlackSetupResult } from '../../../../shared/slack.ts'
import type { WebhookConnection, WebhookConnectionRequest } from '../../../../shared/connections.ts'

export class WorkflowApiError extends Error {
  status: number
  code: string
  constructor(message: string, status: number, code: string) {
    super(message)
    this.status = status
    this.code = code
  }
}
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init.headers },
      signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
      cache: 'no-store',
    })
  } catch (error) {
    if (init.signal?.aborted) throw error
    throw new WorkflowApiError('Cannot reach the backend. Check that it is running, then try again.', 0, 'NETWORK_ERROR')
  }
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const apiError = data as ApiErrorResponse | null
    const code = apiError?.error?.code
    // Display known, actionable errors. Do not render arbitrary server/proxy messages.
    const messages: Record<string, string> = {
      CONNECTION_CHANGED: 'A saved service connection changed or was removed. Update setup with Muse before saving again.',
      CONNECTIONS_UNAVAILABLE: 'The backend could not load saved service connections. Check its connection setup.',
      VERSION_CONFLICT: 'A newer version was saved in another tab. Reopen it from saved drafts before saving again.',
      WORKFLOW_NOT_FOUND: 'This saved workflow could not be found. Choose another saved draft.',
      INVALID_WORKFLOW: 'The workflow has invalid or inconsistent references. Review its diagram and plan.',
      INVALID_REQUEST: 'Check the workflow fields and limits: title up to 200 characters and description up to 4,000.',
      PAYLOAD_TOO_LARGE: 'This workflow is too large to save. Reduce its size and try again.',
      SLACK_SETUP_INVALID: 'Enter a connection name, a channel such as #general, and a valid Slack incoming webhook URL.',
      SLACK_CREDENTIAL_UNAVAILABLE: 'Could not save the webhook privately. Check backend credential storage and its permissions.',
      CONNECTION_SETUP_INVALID: 'Enter a valid webhook URL and authentication settings. Slack uses authentication in its URL.',
      CONNECTION_CREDENTIAL_UNAVAILABLE: 'Could not save the credential privately. Check backend storage permissions and available space.',
      CONNECTION_SETUP_UNAVAILABLE: 'Restart or redeploy the backend to enable connection setup.',
      SLACK_CONNECTION_UNAVAILABLE: 'Could not save the Slack connection. Check the saved connections file and its permissions.',
      SLACK_SETUP_UNAVAILABLE: 'Restart the backend to enable Slack setup.',
    }
    throw new WorkflowApiError((code && messages[code]) || 'The backend could not complete the request. Please try again.', response.status, code ?? 'REQUEST_FAILED')
  }
  if (!data || typeof data !== 'object') throw new WorkflowApiError('The backend returned an unexpected response.', response.status, 'INVALID_RESPONSE')
  return data as T
}
export async function listSlackConnections(signal?: AbortSignal) {
  const result = await request<{ connections: SlackSetupResult[] }>('/connections/slack', { signal })
  if (!Array.isArray(result.connections)) throw new WorkflowApiError('Could not read saved Slack connections.', 200, 'INVALID_RESPONSE')
  return result.connections
}
export async function listConfiguredConnections(signal?: AbortSignal) {
  const result = await request<{ connections: WebhookConnection[] }>('/connections/configured', { signal })
  if (!Array.isArray(result.connections)) throw new WorkflowApiError('Could not read saved connections.', 200, 'INVALID_RESPONSE')
  return result.connections
}
export async function setupWebhookConnection(input: WebhookConnectionRequest) {
  const result = await request<{ connection: WebhookConnection }>('/connections', { method: 'POST', body: JSON.stringify(input) })
  if (!result.connection?.id || !result.connection.authentication?.secretRef) throw new WorkflowApiError('Could not read the saved connection.', 200, 'INVALID_RESPONSE')
  return result.connection
}
export async function setupSlackConnection(input: SlackSetupRequest) {
  const result = await request<SlackSetupResult>('/connections/slack', { method: 'POST', body: JSON.stringify(input) })
  if (!result.connection?.id || result.connection.authentication?.type !== 'slack-webhook' || !result.channel)
    throw new WorkflowApiError('Could not read the saved Slack connection.', 200, 'INVALID_RESPONSE')
  return result
}
export async function listWorkflows(signal?: AbortSignal) {
  const data = await request<{ workflows: WorkflowSummary[] }>('/workflows', { signal })
  if (!Array.isArray(data.workflows)) throw new WorkflowApiError('The backend returned an unexpected response.', 200, 'INVALID_RESPONSE')
  return data.workflows
}
export async function getWorkflow(id: string, signal?: AbortSignal) {
  const { workflow } = await request<{ workflow: SavedWorkflow }>(`/workflows/${encodeURIComponent(id)}`, { signal })
  if (!workflow?.plan || !workflow.diagram || !Number.isInteger(workflow.version)) throw new WorkflowApiError('The saved workflow could not be read.', 200, 'INVALID_RESPONSE')
  return workflow
}
export async function saveWorkflow(draft: WorkflowDraft, current: SavedWorkflow | null) {
  const { workflow } = await request<{ workflow: SavedWorkflow }>(current ? `/workflows/${encodeURIComponent(current.id)}` : '/workflows', {
    method: current ? 'PATCH' : 'POST',
    body: JSON.stringify(current ? { expectedVersion: current.version, draft } : draft),
  })
  return workflow
}
