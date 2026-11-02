import type { PlanQuestion, PlanStep, WorkflowDraft, WorkflowPlan } from './workflows.ts'
export type PlanningProposal = {
  title: string
  summary: string
  expectedOutcome: string
  steps: Omit<PlanStep, 'webhookTemplateId' | 'reviewed' | 'configuredBy'>[]
  questions: Omit<PlanQuestion, 'answer'>[]
  webhookBindings?: { webhookId: string; connectionId: string }[]
}
export type PlanWorkflowRequest = WorkflowDraft
export type PlanWorkflowResponse = { plan: WorkflowPlan; model: string }
