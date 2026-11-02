import type { WorkflowDraft } from '../../shared/workflows.ts'
import type { PlanningProposal } from '../../shared/planning.ts'
import { refreshPlanChecks } from '../../shared/setup.ts'

export function draftFixture(): WorkflowDraft {
  const draft: WorkflowDraft = {
    prompt: 'Route support requests.',
    diagram: { id: 'diagram-1', title: 'Support triage', summary: 'Route requests.', nodes: [
      { id: 'start', label: 'Receive', role: 'trigger', description: '', position: { x: 0, y: 0 } },
      { id: 'send', label: 'Notify', role: 'action', description: '', position: { x: 100, y: 0 } },
    ], edges: [{ id: 'edge-1', source: 'start', target: 'send' }] },
    plan: {
      id: 'plan-1', sourceDiagramId: 'diagram-1', title: 'Support triage', summary: '', expectedOutcome: 'Notify support.',
      steps: [
        { id: 'start', title: 'Receive', role: 'trigger', description: '', operation: 'Receive request', inputs: [], outputs: [], configuration: [], mappings: [] },
        { id: 'send', title: 'Notify', role: 'action', description: '', operation: 'Send webhook', inputs: [], outputs: [], configuration: [], mappings: [], webhookTemplateId: 'notify' },
      ], edges: [{ id: 'edge-1', source: 'start', target: 'send' }],
      webhooks: [{ id: 'notify', name: 'Notify support', direction: 'outgoing', method: 'POST', event: 'request.created', purpose: '', suggestionReason: '', endpoint: { kind: 'external', urlTemplate: 'https://example.invalid/notify' }, authentication: { type: 'secret-header', headerName: 'X-Token', secretRef: 'notify_token' }, payloadTemplate: { subject: '{{request.subject}}' } }],
      questions: [], checks: [],
    },
  }
  return { ...draft, plan: refreshPlanChecks(draft.plan) }
}

export function proposalFixture(draft: WorkflowDraft = draftFixture()): PlanningProposal {
  return {
    title: 'AI proposed title', summary: 'Receive a request and notify support.', expectedOutcome: 'Support receives the request.',
    steps: draft.plan.steps.map(({ webhookTemplateId, reviewed, ...step }) => structuredClone(step)),
    questions: [],
  }
}
