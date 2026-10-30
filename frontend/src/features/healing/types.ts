import type { DemoRunFrame } from '../canvas/types'
import type { PlanMapping } from '../workflows/types'

export type FailedRunSnapshot = {
  runId: string
  scenarioLabel: string
  frame: DemoRunFrame
}

export type RepairCheck = { id: string; title: string; passed: boolean; detail: string }
export type RepairReview = {
  snapshot: FailedRunSnapshot
  decision: 'review' | 'rejected' | 'applied'
  checks: RepairCheck[] | null
  proposal: RepairProposal | null
}

// Frontend repair contract. A validated MUSE response will replace this proposal.
export type RepairProposal = {
  id: string
  stepId: string
  webhookId: string
  title: string
  explanation: string
  originalPayload: Record<string, string>
  repairedPayload: Record<string, string>
  originalTemplate: Record<string, string>
  repairedTemplate: Record<string, string>
  originalMappings: PlanMapping[]
  repairedMappings: PlanMapping[]
  response: Record<string, unknown>
  originalField: string
  replacementField: string
}
