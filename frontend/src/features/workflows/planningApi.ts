import type { PlanWorkflowRequest, PlanWorkflowResponse } from '../../../../shared/planning.ts'
export async function generateWorkflowPlan(draft: PlanWorkflowRequest, signal: AbortSignal): Promise<PlanWorkflowResponse> {
  let response: Response
  try {
    response = await fetch('/api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
      body: JSON.stringify(draft), signal: AbortSignal.any([signal, AbortSignal.timeout(110000)]),
    })
  } catch (error) {
    if (signal.aborted) throw error
    throw new Error('The planning request could not finish. Check the backend before retrying; it may already have reached Muse.')
  }
  const result = await response.json().catch(() => null)
  if (!response.ok) {
    const messages: Record<string, string> = {
      MUSE_NOT_CONFIGURED: 'Configure the Muse key in the backend before generating a plan.',
      MUSE_AUTH_FAILED: 'Muse rejected the key or its model access.',
      MUSE_MODEL_UNAVAILABLE: 'The configured Muse model is unavailable. Check model access in the Meta developer dashboard.',
      MUSE_BILLING_REQUIRED: 'Check your Meta billing and credits before continuing.',
      MUSE_RATE_LIMITED: 'Muse usage limit reached. Check your quota before retrying.',
      PARSE_BUSY: 'Another AI request is in progress. Wait for it to finish.',
      MUSE_TIMEOUT: 'Planning timed out or was cancelled. The request may already have used credits.',
      MUSE_INVALID_RESPONSE: 'Muse returned an invalid plan. Your current draft is unchanged.',
      MUSE_OUTPUT_LIMIT: 'Muse reached its output limit before finishing the plan. Your current draft is unchanged. No automatic retry was made.',
      MUSE_INCOMPLETE: 'Muse did not finish the plan. Your current draft is unchanged. No automatic retry was made.',
      MUSE_UNAVAILABLE: 'Muse returned a server error. Your current draft is unchanged. Try again later.',
      INVALID_WORKFLOW: 'Review your current draft configuration before asking Muse to plan it.',
    }
    throw new Error(messages[result?.error?.code] ?? 'The plan could not be generated. Your current draft is unchanged.')
  }
  if (!result?.plan || result.model !== 'muse-spark-1.3' || result.plan.sourceDiagramId !== draft.diagram.id || !Array.isArray(result.plan.steps) || !result.plan.steps.length) throw new Error('Muse returned an unexpected plan. Your current draft is unchanged.')
  return result as PlanWorkflowResponse
}
