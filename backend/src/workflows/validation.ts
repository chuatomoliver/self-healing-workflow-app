import type { DiagramEdge, WorkflowDraft } from '../../../shared/workflows.ts'
import { ApiError } from '../errors.ts'

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

export function validateDraft(draft: WorkflowDraft) {
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
  }
  for (const question of plan.questions) if (!steps.has(question.stepId)) invalid('Questions must reference existing steps.')
  validateEdges(diagram.edges, nodes, 'Diagram')
  validateEdges(plan.edges, steps, 'Plan')
  // URLs are only draft templates. Nothing here resolves credentials or makes requests.
  for (const webhook of plan.webhooks) {
    let url: URL
    try { url = new URL(webhook.endpoint.urlTemplate) } catch { invalid('Webhook endpoint templates must be valid HTTPS URLs.') }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
      invalid('Webhook templates require HTTPS without embedded credentials, query strings, or fragments.')
    }
  }
}
