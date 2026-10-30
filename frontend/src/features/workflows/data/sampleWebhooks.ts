import type { PlanWebhookTemplate } from '../types'

// Illustrative custom webhook contracts, not vendor-specific API definitions.
// MUSE can later suggest templates in this shape through the validated REST response.
export const sampleWebhooks: PlanWebhookTemplate[] = [
  {
    id: 'support-intake', name: 'Support intake', direction: 'incoming', method: 'POST',
    event: 'support.request.received',
    purpose: 'Start the workflow when the support service sends a new request.',
    suggestionReason: 'The first step needs an event that supplies the sender, subject, and request text.',
    endpoint: { kind: 'managed', urlTemplate: 'https://api.example.invalid/webhooks/{workflow_id}/support-intake' },
    authentication: { type: 'signature', headerName: 'X-Webhook-Signature', secretRef: 'support_intake_signing_secret' },
    payloadTemplate: {
      event: 'support.request.received',
      id: '{{source.message.id}}',
      from: '{{source.message.from}}',
      subject: '{{source.message.subject}}',
      body: '{{source.message.body}}',
    },
  },
  {
    id: 'on-call-alert', name: 'On-call alert', direction: 'outgoing', method: 'POST',
    event: 'support.request.urgent',
    purpose: 'Send urgent request details to the on-call notification service.',
    suggestionReason: 'The urgent branch needs to notify the team after the urgency rule is resolved.',
    endpoint: { kind: 'external', urlTemplate: 'https://hooks.example.invalid/on-call' },
    authentication: { type: 'secret-header', headerName: 'X-Webhook-Token', secretRef: 'on_call_webhook_token' },
    payloadTemplate: {
      event: 'support.request.urgent',
      heading: '{{request.subject}}',
      body: '{{request.text}}',
      sender: '{{request.sender}}',
    },
  },
  {
    id: 'support-queue', name: 'Support queue', direction: 'outgoing', method: 'POST',
    event: 'support.request.queued',
    purpose: 'Send standard request details to the support queue service.',
    suggestionReason: 'The standard branch needs to hand off the request for the support team to pick up.',
    endpoint: { kind: 'external', urlTemplate: 'https://hooks.example.invalid/support-queue' },
    authentication: { type: 'secret-header', headerName: 'X-Webhook-Token', secretRef: 'support_queue_webhook_token' },
    payloadTemplate: {
      event: 'support.request.queued',
      title: '{{request.subject}}',
      description: '{{request.text}}',
      requester: '{{request.sender}}',
    },
  },
]
