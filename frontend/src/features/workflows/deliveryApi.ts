import type { DeliveryRequest, WebhookDelivery } from '../../../../shared/deliveries.ts'

const messages: Record<string, string> = {
  INVALID_REQUEST: 'Check the test data, request ID, and saved draft version.',
  PAYLOAD_TOO_LARGE: 'Use a smaller test-data object. The request limit is 32 KB.',
  WORKFLOW_NOT_FOUND: 'This saved workflow could not be found. Reopen the draft list.',
  WEBHOOK_NOT_FOUND: 'This webhook is no longer in the saved draft. Reopen the workflow.',
  WEBHOOK_DELIVERY_NOT_CONFIGURED: 'Webhook delivery is not configured on the backend.',
  WEBHOOK_DESTINATION_BLOCKED: 'This destination is not allowed by the backend. Ask the backend owner to allow the receiver address.',
  WEBHOOK_SECRET_REQUIRED: 'The referenced webhook credential needs to be configured in the backend.',
  WEBHOOK_SECRET_UNAVAILABLE: 'The backend could not read the referenced webhook credential.',
  WEBHOOK_SETUP_REQUIRED: 'Review and save the endpoint, authentication, and payload mappings first.',
  WEBHOOK_DATA_REQUIRED: 'Supply test data for every mapped payload field.',
  WEBHOOK_PAYLOAD_TOO_LARGE: 'The mapped payload exceeds 16 KB. Use smaller test data.',
  WEBHOOK_HEADER_INVALID: 'Use a dedicated authentication header in webhook setup.',
  WEBHOOK_EVENT_INVALID: 'Use a simple event name such as order.created.',
  WEBHOOK_INCOMING_ONLY: 'Incoming webhooks receive events; this action sends outgoing webhooks.',
  VERSION_CONFLICT: 'The saved draft changed. Reopen it before sending.',
  DELIVERY_ID_CONFLICT: 'This delivery ID was already used with different data. Review delivery history.',
  DELIVERY_BUSY: 'A delivery is already in progress. Wait for its result.',
  DELIVERY_RESULT_UNAVAILABLE: 'The receiver may have received the webhook, but the result could not be saved. Check history and the receiver before another send.',
}
export class DeliveryRequestError extends Error {
  uncertain: boolean
  constructor(message: string, uncertain = false) { super(message); this.uncertain = uncertain }
}
async function readResponse(response: Response) {
  const value = await response.json().catch(() => null)
  if (!response.ok) throw new DeliveryRequestError(messages[value?.error?.code] ?? 'The delivery request could not finish. Check history before another send.', !messages[value?.error?.code] || ['DELIVERY_RESULT_UNAVAILABLE', 'DELIVERY_ID_CONFLICT'].includes(value?.error?.code))
  return value
}
function path(workflowId: string, webhookId: string) { return `/api/workflows/${encodeURIComponent(workflowId)}/webhooks/${encodeURIComponent(webhookId)}` }
export async function listDeliveries(workflowId: string, webhookId: string, signal: AbortSignal): Promise<WebhookDelivery[]> {
  const result = await readResponse(await fetch(`${path(workflowId, webhookId)}/deliveries`, { signal, cache: 'no-store' }))
  if (!Array.isArray(result?.deliveries)) throw new Error('Delivery history could not be read.')
  return result.deliveries
}
export async function deliverTestWebhook(workflowId: string, webhookId: string, input: DeliveryRequest): Promise<WebhookDelivery> {
  let response: Response
  try { response = await fetch(`${path(workflowId, webhookId)}/test-deliveries`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(35000),
  }) } catch { throw new DeliveryRequestError('The delivery result is unknown. Refresh history and check the receiver before another send.', true) }
  const result = await readResponse(response)
  if (!result?.delivery?.id || !['pending', 'succeeded', 'failed', 'unknown'].includes(result.delivery.status)) throw new DeliveryRequestError('The delivery result is unknown. Refresh history before another send.', true)
  return result.delivery
}
