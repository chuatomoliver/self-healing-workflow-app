import { randomUUID } from 'node:crypto'
import type { SavedWorkflow } from '../../shared/workflows.ts'
import type { ExecutionProgram } from '../../shared/execution.ts'
import type { WebhookConnection } from '../../shared/connections.ts'
import { SLACK_ENDPOINT, SLACK_REFERENCE_HEADER } from '../../shared/slack.ts'
import { draftFixture } from './fixtures.ts'
import { executable } from './execution-fixtures.ts'

export function purchaseFixture() {
  const draft = draftFixture()
  const connection: WebhookConnection = { id: 'slack_purchase', name: 'Purchase notifications', description: 'Send purchase reviews to #general.',
    slackChannel: '#general', endpointUrl: SLACK_ENDPOINT, authentication: { type: 'slack-webhook', headerName: SLACK_REFERENCE_HEADER, secretRef: 'slack_purchase' } }
  const definitions = [
    { id: 'n1', role: 'trigger', title: 'Manual Trigger', operation: 'manual_trigger', outputs: [] },
    { id: 'n2', role: 'transform', title: 'Set Purchase Details', operation: 'set_fields', outputs: ['purchase.id', 'purchase.requester', 'purchase.department', 'purchase.amount', 'purchase.currency'] },
    { id: 'n3', role: 'decision', title: 'Validate Purchase', operation: 'validate_purchase', outputs: ['purchase.isValid'] },
    { id: 'n4', role: 'decision', title: 'Determine Review Level', operation: 'assign_review_level', outputs: ['purchase.reviewLevel'] },
    { id: 'n5', role: 'transform', title: 'Compose Notification', operation: 'compose_text', outputs: ['notification.text'] },
    { id: 'n6', role: 'action', title: 'Notify via Slack', operation: 'slack_incoming_webhook_send', outputs: [] },
  ] as const
  const edges = definitions.slice(1).map((step, index) => ({ id: `e${index + 1}`, source: definitions[index].id, target: step.id }))
  draft.diagram.nodes = definitions.map((step, index) => ({ id: step.id, label: step.title, role: step.role, description: '', position: { x: index * 200, y: 0 } }))
  draft.diagram.edges = edges
  draft.plan.steps = definitions.map((step) => ({ id: step.id, title: step.title, operation: step.operation, role: step.role, description: '', configuredBy: 'muse', inputs: [],
    outputs: step.outputs.map((name) => ({ name, description: '' })), configuration: step.role === 'decision' ? [{ label: 'Rule', value: step.id === 'n3' ? 'Requester and department required; positive numeric amount.' : 'Amount >= 10000 requires manager review.' }] : [],
    mappings: step.id === 'n6' ? [{ source: 'n5.notification.text', target: 'webhook.payload.text' }] : [], ...(step.id === 'n6' ? { webhookTemplateId: 'notify' } : {}),
  }))
  draft.plan.edges = edges; draft.plan.structureReviewed = true; draft.plan.questions = []
  draft.plan.webhooks = [{ ...draft.plan.webhooks[0], id: 'notify', event: 'purchase.review', connectionId: connection.id, configuredBy: 'muse',
    endpoint: { kind: 'external', urlTemplate: connection.endpointUrl }, authentication: connection.authentication, payloadTemplate: { text: '{{n5.notification.text}}' } }]
  const workflow: SavedWorkflow = { ...draft, id: randomUUID(), version: 1, createdAt: '', updatedAt: '' }
  const program: ExecutionProgram = { steps: [
    executable('n1', 'input'),
    executable('n2', 'assign', { assignments: Object.entries({ 'purchase.id': 'PR-001', 'purchase.requester': 'Alex', 'purchase.department': 'IT', 'purchase.amount': 15000, 'purchase.currency': 'PHP' }).map(([target, value]) => ({ target, kind: 'constant', source: '', value, template: '', condition: { path: '', operator: 'exists', value: null }, otherwise: null })) }),
    executable('n3', 'validate', { validPath: 'purchase.isValid', errorsPath: 'purchase.errors', rules: [
      { condition: { path: 'n2.purchase.requester', operator: 'nonempty', value: null }, message: 'Requester required.' },
      { condition: { path: 'n2.purchase.department', operator: 'nonempty', value: null }, message: 'Department required.' },
      { condition: { path: 'n2.purchase.amount', operator: 'number', value: null }, message: 'Amount must be numeric.' },
      { condition: { path: 'n2.purchase.amount', operator: 'gt', value: 0 }, message: 'Amount must be positive.' },
    ] }),
    executable('n4', 'assign', { assignments: [{ target: 'purchase.reviewLevel', kind: 'choose', source: '', value: 'Manager review required', template: '', condition: { path: 'n2.purchase.amount', operator: 'gte', value: 10000 }, otherwise: 'Standard review' }] }),
    executable('n5', 'assign', { assignments: [{ target: 'notification.text', kind: 'template', source: '', value: null, template: 'Request awaiting review: {{n2.purchase.id}}, {{purchase.requester}}, {{purchase.department}}, {{purchase.amount}} {{purchase.currency}}, Validation {{n3.purchase.isValid}}, {{n4.purchase.reviewLevel}}', condition: { path: '', operator: 'exists', value: null }, otherwise: null }] }),
    executable('n6', 'webhook', { requiredPaths: ['n5.notification.text'] }),
  ] }
  return { workflow, program, connection }
}
