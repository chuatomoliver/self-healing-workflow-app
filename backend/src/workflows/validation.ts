import type { DiagramEdge, WorkflowDraft } from '../../../shared/workflows.ts'
import { ApiError } from '../errors.ts'
import { stepSetupIssues, webhookAuthenticationIssue, webhookEndpointIssue, webhookMappingsIssue, webhookPayloadIssue } from '../../../shared/setup.ts'
import { SLACK_ENDPOINT } from '../../../shared/slack.ts'

function invalid(message: string): never { throw new ApiError(400, 'INVALID_WORKFLOW', message) }
function unique(items: { id: string }[], label: string) {
  const ids = new Set(items.map((item) => item.id))
  if (ids.size !== items.length) invalid(`${label} must have unique IDs.`)
  return ids
}
function validateEdges(edges: DiagramEdge[], nodes: Set<string>, label: string) {
  unique(edges, `${label} edges`)
  for (const edge of edges) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) invalid(`${label} edges must reference existing nodes.`)
    if (edge.source === edge.target) invalid(`${label} edges cannot connect a node to itself.`)
  }
  // The first executable contract will support acyclic graphs. Reject cycles now.
  const indegree = new Map([...nodes].map((id) => [id, 0]))
  const outgoing = new Map([...nodes].map((id) => [id, [] as string[]]))
  for (const edge of edges) {
    indegree.set(edge.target, indegree.get(edge.target)! + 1)
    outgoing.get(edge.source)!.push(edge.target)
  }
  const queue = [...nodes].filter((id) => indegree.get(id) === 0)
  for (let index = 0; index < queue.length; index++) {
    for (const target of outgoing.get(queue[index])!) {
      indegree.set(target, indegree.get(target)! - 1)
      if (indegree.get(target) === 0) queue.push(target)
    }
  }
  if (queue.length !== nodes.size) invalid(`${label} contains a cycle. Drafts currently support acyclic workflows.`)
}

export function validateDraft(draft: WorkflowDraft, localReceiverUrl?: string) {
  const { diagram, plan } = draft
  const nodes = unique(diagram.nodes, 'Diagram nodes')
  const steps = unique(plan.steps, 'Plan steps')
  const webhooks = unique(plan.webhooks, 'Webhook templates')
  unique(plan.questions, 'Questions')
  unique(plan.checks, 'Checks')
  if (plan.sourceDiagramId !== diagram.id) invalid('The plan must reference its source diagram.')
  if (nodes.size !== steps.size || [...nodes].some((id) => !steps.has(id))) invalid('Plan steps must match the source diagram nodes.')
  for (const step of plan.steps) {
    if (step.role !== diagram.nodes.find((node) => node.id === step.id)!.role) invalid('Plan step roles must match their diagram nodes.')
    if (step.webhookTemplateId && !webhooks.has(step.webhookTemplateId)) invalid('Plan steps must reference existing webhook templates.')
    const webhook = plan.webhooks.find((item) => item.id === step.webhookTemplateId)
    if (webhook && step.role !== (webhook.direction === 'incoming' ? 'trigger' : 'action')) invalid('Incoming webhooks require trigger steps and outgoing webhooks require action steps.')
    if (step.reviewed && stepSetupIssues(step).length) invalid('Resolve missing step configuration before marking it reviewed.')
    if ((webhook?.setup?.payloadReviewed || webhook?.configuredBy) && webhookMappingsIssue(step, webhook!)) invalid('The step mappings must match the configured webhook payload.')
  }
  for (const question of plan.questions) if (!steps.has(question.stepId)) invalid('Questions must reference existing steps.')
  validateEdges(diagram.edges, nodes, 'Diagram')
  validateEdges(plan.edges, steps, 'Plan')
  const signature = (edges: DiagramEdge[]) => edges.map((edge) => JSON.stringify([edge.source, edge.target, edge.label ?? ''])).sort()
  if (JSON.stringify(signature(diagram.edges)) !== JSON.stringify(signature(plan.edges))) invalid('Plan connections must match the source diagram.')
  // URLs are only draft templates. Nothing here resolves credentials or makes requests.
  for (const webhook of plan.webhooks) {
    let url: URL
    try { url = new URL(webhook.endpoint.urlTemplate) } catch { invalid('Webhook endpoint templates must be valid HTTPS URLs.') }
    if (url.hostname === 'hooks.slack.com' && webhook.endpoint.urlTemplate !== SLACK_ENDPOINT)
      invalid('Use Slack connection setup to store the secret webhook URL outside the workflow.')
    if (webhook.authentication.type === 'slack-webhook' && (webhook.direction !== 'outgoing' || !webhook.connectionId || webhookAuthenticationIssue(webhook)))
      invalid('Slack delivery requires a saved outgoing Slack connection.')
    const localReceiver = localReceiverUrl && url.href === localReceiverUrl && url.protocol === 'http:' && url.hostname === '127.0.0.1'
    if ((!localReceiver && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash) {
      invalid('Webhook templates require HTTPS without embedded credentials, query strings, or fragments.')
    }
    if (webhook.suggestedBy === 'muse') {
      if (plan.steps.filter((step) => step.webhookTemplateId === webhook.id).length !== 1) invalid('Each Muse webhook suggestion must reference exactly one step.')
      const incoming = webhook.direction === 'incoming'
      if (webhook.endpoint.kind !== (incoming ? 'managed' : 'external')) {
        invalid('Webhook endpoint kinds must match their direction.')
      }
      const fields = Object.keys(webhook.payloadTemplate)
      if (fields.length < 1 || fields.length > 20 || !fields.every((field) => /^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(field))
        || !Object.values(webhook.payloadTemplate).every((value) => value.length <= 204 && /^\{\{[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*){1,8}\}\}$/.test(value))) {
        invalid('Muse webhook payload suggestions must contain field references only.')
      }
    }
    if (webhook.setup?.endpointReviewed && webhookEndpointIssue(webhook)) invalid('Resolve the webhook endpoint before marking it reviewed.')
    if (webhook.setup?.authenticationReviewed && webhookAuthenticationIssue(webhook)) invalid('Resolve the authentication reference before marking it reviewed.')
    if (webhook.setup?.payloadReviewed && webhookPayloadIssue(webhook)) invalid('Resolve the payload fields before marking them reviewed.')
    if (webhook.configuredBy && (!webhook.connectionId || webhookEndpointIssue(webhook) || webhookAuthenticationIssue(webhook) || webhookPayloadIssue(webhook))) invalid('Machine-configured webhooks require a valid saved connection and payload.')
  }
}
