import type { WorkflowPlan } from '../../../../shared/workflows.ts'
import { stepSetupIssues, webhookMappingsIssue, webhookSetupIssues } from '../../../../shared/setup.ts'

export function canvasSetupBlockers(plan: WorkflowPlan): string[] {
  const blockers: string[] = []
  if (!plan.steps.length) blockers.push('Add workflow steps before running.')
  if (!plan.structureReviewed) blockers.push('Review the workflow structure in Parse diagram.')
  for (const step of plan.steps) {
    const pending = step.configuration.filter((setting) => !setting.label.trim() || !setting.value.trim() || setting.needsInput)
    if (pending.length) blockers.push(`${step.title}: complete ${pending.map((setting) => setting.label.trim() || 'the unnamed setting').join(', ')} and clear Still needs input.`)
    const issues = stepSetupIssues(step).filter((issue) => !issue.startsWith('Complete the configuration settings'))
    blockers.push(...issues.map((issue) => `${step.title}: ${issue}`))
    if (!pending.length && !issues.length && !step.reviewed && step.configuredBy !== 'muse') blockers.push(`${step.title}: review this step's setup.`)
  }
  for (const hook of plan.webhooks) {
    const step = plan.steps.find((item) => item.webhookTemplateId === hook.id)
    if (!step) { blockers.push(`${hook.name}: link this webhook to a workflow step.`); continue }
    blockers.push(...webhookSetupIssues(hook).map((issue) => `${hook.name}: ${issue}`))
    const mapping = webhookMappingsIssue(step, hook)
    if (mapping) blockers.push(`${hook.name}: ${mapping}`)
  }
  for (const question of plan.questions) {
    if (!question.answer?.trim()) blockers.push(`Answer in Plan Workflow: ${question.question}`)
  }
  return blockers
}
