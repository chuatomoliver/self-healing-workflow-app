import type { PlanQuestion } from './workflows.ts'

// Older saved drafts contain connection setup as generated questions. Keep those
// records intact, but present them with webhook requirements, not business choices.
export const CONNECTION_SETUP_EXPLANATION = 'Muse can reuse a service after it has been connected once. Do not put secret values in your prompt or answers.'
export function isConnectionSetupQuestion(question: PlanQuestion): boolean {
  return question.id.startsWith('connection-setup-') && question.explanation === CONNECTION_SETUP_EXPLANATION
}
