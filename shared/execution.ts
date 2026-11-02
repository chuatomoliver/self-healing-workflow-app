import type { SavedWorkflow } from './workflows.ts'
import type { WebhookDelivery } from './deliveries.ts'

export type Scalar = string | number | boolean | null
export type RunData = Record<string, unknown>
export type Condition = { path: string; operator: 'exists' | 'nonempty' | 'number' | 'eq' | 'neq' | 'gte' | 'gt' | 'lte' | 'lt'; value: Scalar }
export type Assignment = { target: string; kind: 'copy' | 'constant' | 'template' | 'choose'; source: string; value: Scalar; template: string; condition: Condition; otherwise: Scalar }
export type ExecutableStep = {
  stepId: string; kind: 'input' | 'validate' | 'assign' | 'branch' | 'webhook' | 'unsupported'
  requiredPaths: string[]; rules: { condition: Condition; message: string }[]; validPath: string; errorsPath: string
  assignments: Assignment[]; condition: Condition; trueTarget: string; falseTarget: string; explanation: string
}
export type ExecutionProgram = { steps: ExecutableStep[] }
export type RunStatus = 'queued' | 'preparing' | 'running' | 'succeeded' | 'failed' | 'unknown' | 'cancelled'
export type StepStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'unknown'
export type RunFailure = { code: string; message: string; missingPath?: string }
export type StepAttempt = { number: number; status: StepStatus; startedAt: string; completedAt: string | null; input: RunData; output?: RunData; definition?: ExecutableStep; error?: RunFailure; deliveryId?: string; delivery?: WebhookDelivery }
export type RunStep = { stepId: string; status: StepStatus; attempts: StepAttempt[]; selectedTarget?: string }
export type RunEvent = { id: string; at: string; stepId?: string; level: 'info' | 'success' | 'error'; message: string }
export type RunRepair = { id: string; stepId: string; attempt: number; status: 'generating' | 'proposed' | 'applied' | 'rejected' | 'unavailable'; title: string; explanation: string; sourcePath: string; targetPath: string; createdAt: string; resolvedAt: string | null; checks: { title: string; passed: boolean; detail: string }[] }
export type WorkflowRun = {
  id: string; workflowId: string; workflowVersion: number; fingerprint: string; revision: number
  status: RunStatus; input: RunData; context: RunData; snapshot: SavedWorkflow; program: ExecutionProgram | null
  steps: RunStep[]; events: RunEvent[]; repairs: RunRepair[]; cancelRequested: boolean
  autoRepair: boolean
  inheritedAliases: { sourcePath: string; targetPath: string; fromRunId: string; stepId: string; applied?: boolean }[]
  createdAt: string; updatedAt: string; completedAt: string | null; failure?: RunFailure
}
export type RunSummary = Pick<WorkflowRun, 'id' | 'workflowId' | 'workflowVersion' | 'revision' | 'status' | 'createdAt' | 'updatedAt' | 'completedAt'> & { title: string; completedSteps: number; totalSteps: number; failedStep: string | null; appliedRepairs: number }
export type StartRunRequest = { requestId: string; expectedVersion: number; input: RunData; autoRepair?: boolean }
export type RepairSuggestion = { title: string; explanation: string; sourcePath: string; targetPath: string }
export const summarizeRun = (run: WorkflowRun): RunSummary => ({ id: run.id, workflowId: run.workflowId, workflowVersion: run.workflowVersion, revision: run.revision, status: run.status, createdAt: run.createdAt, updatedAt: run.updatedAt, completedAt: run.completedAt, title: run.snapshot.plan.title, completedSteps: run.steps.filter((step) => step.status === 'succeeded').length, totalSteps: run.steps.length, failedStep: run.steps.find((step) => step.status === 'failed' || step.status === 'unknown')?.stepId ?? null, appliedRepairs: run.repairs.filter((repair) => repair.status === 'applied').length })
