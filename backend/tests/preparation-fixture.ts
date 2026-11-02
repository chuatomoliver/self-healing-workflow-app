import type { WebhookConnection } from '../../shared/connections.ts'
import type { WorkflowPreparation } from '../src/muse/preparation.ts'
import { draftFixture, proposalFixture } from './fixtures.ts'

export const supportConnection: WebhookConnection = {
  id: 'support', name: 'Support notifications', description: 'Send support request subjects to the support team.',
  endpointUrl: 'https://support.example.com/receiver',
  authentication: { type: 'secret-header', headerName: 'X-Token', secretRef: 'support_token' },
}
export function preparationFixture(): WorkflowPreparation {
  const draft = draftFixture()
  return {
    extraction: {
      title: draft.plan.title, summary: 'Notify support about a supplied request.',
      nodes: draft.diagram.nodes.map(({ position, ...node }) => ({ ...node, app: '', reviewNote: '' })),
      edges: draft.diagram.edges.map((edge) => ({ ...edge, label: '' })),
      webhooks: [{
        id: 'notify', stepId: 'send', name: 'Notify support', direction: 'outgoing', event: 'request.created',
        purpose: 'Send the request subject.', suggestionReason: 'The prompt asks for an HTTP notification.',
        payloadFields: [{ name: 'subject', source: 'request.subject', description: 'Request subject.' }],
      }],
    },
    plan: { ...proposalFixture(draft), webhookBindings: [{ webhookId: 'notify', connectionId: 'support' }] },
  }
}
