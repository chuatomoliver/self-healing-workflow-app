import type { RunData, RunSummary, WorkflowRun } from '../../../../shared/execution.ts'
const messages: Record<string, string> = {
  EXECUTION_NOT_CONFIGURED: 'The backend needs to be restarted with the workflow runner enabled.',
  EXECUTION_UNSUPPORTED: 'This runner supports manual input, validation, transformations, decisions, and outgoing webhooks, up to 40 steps. Other actions need an enabled connector.',
  RUN_SETUP_REQUIRED: 'Complete the setup and save your draft before running.', VERSION_CONFLICT: 'Reopen the latest saved workflow before starting a run.',
  RUN_ID_CONFLICT: 'This request ID was already used with different input.', RUN_CHANGED: 'This run changed. Refresh it before continuing.',
  RUN_NOT_FOUND: 'This run could not be found.', RUN_BUSY: 'Wait for an active operation to finish.', RUN_FINISHED: 'This run has already finished.',
  RUN_INPUT_INVALID: 'Check the run data and use ordinary JSON field names.', RUN_INPUT_TOO_LARGE: 'Run data must fit within 32 KB.',
  REPAIR_NOT_AVAILABLE: 'AI repair supports missing-field mappings. Other errors need manual correction; uncertain deliveries must be checked at the receiver.',
  REPAIR_CHANGED: 'The repair no longer matches the failed checkpoint. Refresh the run.', INVALID_REQUEST: 'Check the input, selected saved version, and required fields.',
  REPAIR_LIMIT: 'This run reached its repair review limit. Correct the workflow or input before starting a new run.',
}
async function request<T>(path: string, signal?: AbortSignal, body?: unknown): Promise<T> {
  let response: Response
  try { response = await fetch(`/api${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000), ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) }
  catch (error) { if (signal?.aborted) throw error; throw new Error('The runner could not be reached. Check run history before trying again; an operation may already have started.') }
  const result = await response.json().catch(() => null)
  if (!response.ok) throw new Error(messages[result?.error?.code] ?? 'The run operation could not finish. Refresh its history before trying again.')
  if (!result || typeof result !== 'object') throw new Error('The runner returned an unexpected response.')
  return result as T
}
export const listRuns = async (id: string, signal?: AbortSignal) => {
  const result = await request<{ runs: RunSummary[] }>(`/workflows/${encodeURIComponent(id)}/runs`, signal)
  if (!Array.isArray(result.runs)) throw new Error('Unexpected run history.')
  return result.runs
}
function checkedRun({ run }: { run: WorkflowRun }) {
  if (!run?.id || !Array.isArray(run.steps) || !Array.isArray(run.events) || !Array.isArray(run.repairs)) throw new Error('Unexpected run details.')
  return run
}
export const getRun = async (id: string, signal?: AbortSignal) => checkedRun(await request<{ run: WorkflowRun }>(`/runs/${encodeURIComponent(id)}`, signal))
const mutation = async (path: string, body: unknown) => checkedRun(await request<{ run: WorkflowRun }>(path, undefined, body))
export const startRun = (workflowId: string, expectedVersion: number, input: RunData, requestId: string, autoRepair = true) => mutation(`/workflows/${encodeURIComponent(workflowId)}/runs`, { expectedVersion, input, requestId, autoRepair })
export const cancelRun = (id: string) => mutation(`/runs/${encodeURIComponent(id)}/cancel`, {})
export const proposeRepair = (id: string, expectedRevision: number, requestId: string) => mutation(`/runs/${encodeURIComponent(id)}/repairs`, { expectedRevision, requestId })
export const decideRepair = (id: string, repairId: string, expectedRevision: number, action: 'reject' | 'resume') => mutation(`/runs/${encodeURIComponent(id)}/repairs/${encodeURIComponent(repairId)}/${action}`, { expectedRevision })
