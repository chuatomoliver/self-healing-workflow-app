import type { DemoRunFrame } from '../canvas/types'
import type { FailedRunSnapshot, RepairCheck, RepairProposal, RepairReview } from '../healing/types'
import type { WorkflowPlan } from '../workflows/types'

export type RunContext = {
  plan: WorkflowPlan
  prompt: string
  diagram: { name: string; size: number; type: string } | null
}

export type RunRecord = {
  id: string
  runId: string
  attempt: number
  inputLabel: string
  startedAt: string
  finishedAt: string | null
  frame: DemoRunFrame
  context: RunContext
}

export type RepairEvent = {
  kind: 'opened' | 'verified' | 'verification-failed' | 'rejected' | 'reopened' | 'applied'
  at: string
  checks: RepairCheck[] | null
  proposal: RepairProposal | null
}

export type RepairRecord = {
  id: string
  runId: string
  stepId: string
  stepTitle: string
  decision: RepairReview['decision']
  snapshot: FailedRunSnapshot
  checks: RepairCheck[] | null
  proposal: RepairProposal | null
  events: RepairEvent[]
}

// Transient references deduplicate React effects; only the records are audit data.
export type SessionHistory = {
  runs: RunRecord[]
  repairs: RepairRecord[]
  observedFrame: DemoRunFrame | null
  observedRunId: string | null
  observedReview: RepairReview | null
}
