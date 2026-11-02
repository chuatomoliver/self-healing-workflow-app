import { randomUUID } from 'node:crypto'
import type { WorkflowExtraction } from '../../../shared/parsing.ts'
import type { PlanWebhookTemplate, WorkflowDraft } from '../../../shared/workflows.ts'
import { ApiError } from '../errors.ts'
import { refreshPlanChecks } from '../../../shared/setup.ts'

export function draftFromExtraction(extraction: WorkflowExtraction, prompt: string): WorkflowDraft {
  const linkedSteps = new Set<string>()
  const webhookIds = new Set<string>()
  for (const webhook of extraction.webhooks) {
    const node = extraction.nodes.find((item) => item.id === webhook.stepId)
    if (!node || webhookIds.has(webhook.id) || linkedSteps.has(webhook.stepId)
      || node.role !== (webhook.direction === 'incoming' ? 'trigger' : 'action')
      || new Set(webhook.payloadFields.map((field) => field.name)).size !== webhook.payloadFields.length) {
      throw new ApiError(502, 'MUSE_INVALID_RESPONSE', 'Muse returned inconsistent webhook suggestions. Clarify the workflow and try again.')
    }
    linkedSteps.add(webhook.stepId)
    webhookIds.add(webhook.id)
  }
  const webhooks: PlanWebhookTemplate[] = extraction.webhooks.map((suggestion) => ({
    suggestedBy: 'muse', id: suggestion.id, name: suggestion.name, direction: suggestion.direction, method: 'POST',
    event: suggestion.event, purpose: suggestion.purpose, suggestionReason: suggestion.suggestionReason,
    endpoint: {
      kind: suggestion.direction === 'incoming' ? 'managed' : 'external',
      urlTemplate: suggestion.direction === 'incoming'
        ? `https://api.example.invalid/webhooks/{workflow_id}/${suggestion.id}`
        : `https://hooks.example.invalid/${suggestion.id}`,
    },
    authentication: {
      type: suggestion.direction === 'incoming' ? 'signature' : 'secret-header',
      headerName: suggestion.direction === 'incoming' ? 'X-Webhook-Signature' : 'X-Webhook-Token',
      secretRef: `webhook_${suggestion.id}_secret`,
    },
    payloadTemplate: Object.fromEntries(suggestion.payloadFields.map((field) => [field.name, `{{${field.source}}}`])),
  }))
  const id = `parsed-${randomUUID()}`
  // Lay out longest-path ranks. Graph validity is checked before returning the draft.
  const levels = new Map(extraction.nodes.map((node) => [node.id, 0]))
  for (let pass = 0; pass < extraction.nodes.length; pass++) {
    let changed = false
    for (const edge of extraction.edges) {
      const level = (levels.get(edge.source) ?? 0) + 1
      if (level > (levels.get(edge.target) ?? 0)) { levels.set(edge.target, level); changed = true }
    }
    if (!changed) break
  }
  const rows = new Map<number, number>()
  const diagram = {
    id, title: extraction.title, summary: extraction.summary,
    nodes: extraction.nodes.map((node) => {
      const level = levels.get(node.id) ?? 0
      const row = rows.get(level) ?? 0
      rows.set(level, row + 1)
      return { ...node, position: { x: level * 300, y: row * 180 } }
    }), edges: extraction.edges,
  }
  const draft: WorkflowDraft = {
    prompt: prompt.trim(), diagram,
    plan: {
      id: `plan-${randomUUID()}`, sourceDiagramId: id, title: diagram.title, summary: diagram.summary,
      expectedOutcome: extraction.summary,
      steps: diagram.nodes.map((node) => {
        const suggestion = extraction.webhooks.find((item) => item.stepId === node.id)
        const fields = suggestion?.payloadFields.map((field) => ({ name: field.name, description: field.description })) ?? []
        return {
          id: node.id, title: node.label, role: node.role, description: node.description, operation: node.label,
          ...(suggestion ? { webhookTemplateId: suggestion.id } : {}),
          inputs: suggestion?.direction === 'outgoing' ? fields : [], outputs: suggestion?.direction === 'incoming' ? fields : [],
          mappings: suggestion?.payloadFields.map((field) => suggestion.direction === 'incoming'
            ? { source: `webhook.payload.${field.name}`, target: field.source }
            : { source: field.source, target: `webhook.payload.${field.name}` }) ?? [],
          configuration: [
            ...(node.app ? [{ label: 'Application', value: node.app }] : []),
            { label: 'Operation setup', value: 'Configure inputs, outputs, and the app connection.', needsInput: true },
            ...(suggestion ? [{ label: 'Webhook setup', value: 'Confirm the real endpoint, provider authentication, and suggested payload mappings.', needsInput: true }] : []),
          ],
        }
      }),
      edges: diagram.edges, webhooks,
      questions: diagram.nodes.filter((node) => node.reviewNote).map((node, index) => ({
        id: `review-${index + 1}`, stepId: node.id, question: node.reviewNote, explanation: 'Clarify this point before configuring the step.',
      })),
      checks: [
        { id: 'structure', title: 'Extracted structure', description: 'Review the AI interpretation against your source.', status: 'pending' },
        { id: 'configuration', title: 'Operation configuration', description: 'Set up connections, fields, and mappings.', status: 'needs-input' },
        ...(webhooks.length ? [{ id: 'webhooks', title: 'Suggested webhook setup', description: 'Review endpoint, authentication, and payload suggestions. No webhook is registered or tested.', status: 'needs-input' as const }] : []),
        { id: 'execution', title: 'Execution validation', description: 'Live execution is not available yet.', status: 'not-run' },
      ],
    },
  }
  return { ...draft, plan: refreshPlanChecks(draft.plan) }
}
