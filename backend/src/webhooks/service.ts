import { createHash, createHmac } from 'node:crypto'
import type { DeliveryRequest } from '../../../shared/deliveries.ts'
import { webhookMappingsIssue, webhookSetupIssues } from '../../../shared/setup.ts'
import { ApiError } from '../errors.ts'
import type { WorkflowRepository } from '../workflows/repository.ts'
import type { DeliveryRepository, DeliveryResult } from './repository.ts'
import { pinDestination } from './destination.ts'
import type { DestinationPolicy, ResolveAddresses } from './destination.ts'
import { loadWebhookSecret } from './credentials.ts'
import { sendWebhook } from './transport.ts'
import type { SendWebhook } from './transport.ts'
import type { WebhookConnection } from '../../../shared/connections.ts'
import type { SavedWorkflow } from '../../../shared/workflows.ts'
import { validateConnectionBindings } from './connections.ts'
import { validSlackWebhookUrl } from '../../../shared/slack.ts'
import { workflowFieldCanonicalizer } from '../../../shared/fieldPaths.ts'

const reservedHeaders = new Set(['host', 'content-type', 'content-length', 'transfer-encoding', 'connection', 'cookie', 'set-cookie', 'proxy-authorization', 'te', 'trailer', 'upgrade', 'expect', 'keep-alive', 'user-agent', 'x-metaflow-event', 'x-metaflow-delivery-id', 'idempotency-key'])
function resolveValue(data: Record<string, unknown>, reference: string): unknown {
  let value: unknown = data
  for (const segment of reference.slice(2, -2).split('.')) {
    if (['__proto__', 'prototype', 'constructor'].includes(segment) || !value || typeof value !== 'object' || !Object.hasOwn(value, segment)) throw new ApiError(400, 'WEBHOOK_DATA_REQUIRED', 'Supply test data for every mapped payload field.')
    value = (value as Record<string, unknown>)[segment]
  }
  return value
}
export function createWebhookDeliveryService(options: {
  workflows: WorkflowRepository; deliveries: DeliveryRepository; policy: DestinationPolicy
  connections?: () => Promise<WebhookConnection[]>
  getSecret?: (reference: string) => Promise<string | undefined>; resolve?: ResolveAddresses; send?: SendWebhook; timeoutMs?: number
}) {
  const busy = new Set<string>()
  return {
    localReceiverUrl: options.policy.localReceiverUrl,
    async list(workflowId: string, webhookId: string) {
      const workflow = await options.workflows.get(workflowId)
      if (!workflow.plan.webhooks.some((item) => item.id === webhookId)) throw new ApiError(404, 'WEBHOOK_NOT_FOUND', 'This webhook could not be found.')
      return options.deliveries.list(workflowId, webhookId)
    },
    async deliver(workflowId: string, webhookId: string, input: DeliveryRequest, snapshot?: SavedWorkflow, runId?: string) {
      if (runId && !snapshot) throw new ApiError(400, 'INVALID_RUN_SNAPSHOT', 'A run delivery requires its saved workflow snapshot.')
      if (snapshot && (snapshot.id !== workflowId || snapshot.version !== input.expectedVersion)) throw new ApiError(400, 'INVALID_RUN_SNAPSHOT', 'The run snapshot does not match this delivery.')
      const fingerprint = createHash('sha256').update(JSON.stringify([workflowId, webhookId, input.expectedVersion, input.sampleData])).digest('hex')
      const previous = await options.deliveries.find(input.requestId)
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new ApiError(409, 'DELIVERY_ID_CONFLICT', 'This delivery ID has already been used with different data.')
        return previous.delivery
      }
      const key = `${workflowId}/${webhookId}`
      if (busy.has(key) || busy.size >= 4) throw new ApiError(429, 'DELIVERY_BUSY', 'A webhook delivery is in progress. Wait for its result.')
      busy.add(key)
      try {
        const workflow = snapshot ?? await options.workflows.get(workflowId)
        if (workflow.version !== input.expectedVersion) throw new ApiError(409, 'VERSION_CONFLICT', 'The saved draft changed. Reopen it before sending a webhook.')
        const template = workflow.plan.webhooks.find((item) => item.id === webhookId)
        if (!template) throw new ApiError(404, 'WEBHOOK_NOT_FOUND', 'This webhook could not be found.')
        if (template.direction !== 'outgoing') throw new ApiError(400, 'WEBHOOK_INCOMING_ONLY', 'Incoming webhooks receive events. This action only sends outgoing webhooks.')
        const slack = template.authentication.type === 'slack-webhook'
        if (slack && !template.connectionId) throw new ApiError(400, 'WEBHOOK_SETUP_REQUIRED', 'Use a saved Slack connection before sending.')
        if (template.connectionId || template.configuredBy) validateConnectionBindings({ ...workflow.plan, webhooks: [template] }, await options.connections?.() ?? [])
        const step = workflow.plan.steps.find((item) => item.webhookTemplateId === webhookId)
        if (!step || webhookSetupIssues(template).length || webhookMappingsIssue(step, template)) throw new ApiError(400, 'WEBHOOK_SETUP_REQUIRED', 'Review and save the endpoint, authentication, and payload mappings before sending.')
        if (reservedHeaders.has(template.authentication.headerName.toLowerCase())) throw new ApiError(400, 'WEBHOOK_HEADER_INVALID', 'Use a dedicated authentication header that does not replace delivery headers.')
        if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,199}$/.test(template.event)) throw new ApiError(400, 'WEBHOOK_EVENT_INVALID', 'Use a simple event name such as order.created.')
        const canonical = workflowFieldCanonicalizer(workflow.plan)
        const payload = Object.fromEntries(Object.entries(template.payloadTemplate).map(([name, reference]) => [name, resolveValue(input.sampleData, `{{${canonical(reference.slice(2, -2))}}}`)]))
        if (slack && (Object.keys(payload).length !== 1 || typeof payload.text !== 'string' || !payload.text.trim()))
          throw new ApiError(400, 'SLACK_MESSAGE_REQUIRED', 'Slack delivery requires one nonempty text field.')
        const body = JSON.stringify(payload)
        if (Buffer.byteLength(body) > 16384) throw new ApiError(413, 'WEBHOOK_PAYLOAD_TOO_LARGE', 'The resolved webhook payload must be at most 16 KB.')
        let secret: string | undefined
        try { secret = await (options.getSecret ?? loadWebhookSecret)(template.authentication.secretRef) } catch { throw new ApiError(503, 'WEBHOOK_SECRET_UNAVAILABLE', 'The backend could not read the referenced webhook credential.') }
        if (!secret || secret.length > 4096 || (template.authentication.type === 'secret-header' && !/^[\x20-\x7e]+$/.test(secret))) throw new ApiError(400, 'WEBHOOK_SECRET_REQUIRED', 'Configure a valid webhook credential in the backend for this reference.')
        if (slack && !validSlackWebhookUrl(secret)) throw new ApiError(400, 'WEBHOOK_SECRET_REQUIRED', 'Save a valid Slack incoming webhook URL using Slack connection setup.')
        // Only a verified saved Slack binding can grant this fixed origin. All
        // public DNS, pinned-address, TLS, and no-redirect checks still apply.
        const destination = await pinDestination(slack ? secret : template.endpoint.urlTemplate,
          slack ? { ...options.policy, allowedOrigins: [...options.policy.allowedOrigins, 'https://hooks.slack.com'] } : options.policy, options.resolve)
        const authentication = slack ? {} : { [template.authentication.headerName]: template.authentication.type === 'signature' ? `sha256=${createHmac('sha256', secret).update(body).digest('hex')}` : secret }
        const reserved = await options.deliveries.reserve({ id: input.requestId, workflowId, workflowVersion: input.expectedVersion, webhookId, fingerprint, ...(runId ? { runId } : {}) })
        if (!reserved.created) return reserved.delivery
        const started = Date.now()
        const signal = AbortSignal.timeout(options.timeoutMs ?? 5000)
        let result: DeliveryResult
        try {
          const status = await (options.send ?? sendWebhook)(destination, body, {
            'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(body)),
            'User-Agent': 'Metaflow-Webhook/1.0', 'X-Metaflow-Event': template.event,
            'X-Metaflow-Delivery-Id': input.requestId, 'Idempotency-Key': input.requestId,
            ...authentication,
          }, signal)
          result = { status: status >= 200 && status < 300 ? 'succeeded' : 'failed', httpStatus: status, durationMs: Date.now() - started, errorCode: status >= 200 && status < 300 ? null : 'HTTP_REJECTED' }
        } catch {
          // A timeout or connection loss may happen after the receiver processed the event.
          result = { status: 'unknown', httpStatus: null, durationMs: Date.now() - started, errorCode: signal.aborted ? 'TIMEOUT' : 'NETWORK_ERROR' }
        }
        try { return await options.deliveries.finish(input.requestId, result) }
        catch { throw new ApiError(503, 'DELIVERY_RESULT_UNAVAILABLE', 'The delivery may have reached the receiver, but its result could not be saved. Check history and the receiver before trying another delivery.') }
      } finally { busy.delete(key) }
    },
  }
}
export type WebhookDeliveryService = ReturnType<typeof createWebhookDeliveryService>
