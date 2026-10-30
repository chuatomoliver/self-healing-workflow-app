import type { DemoRunFrame } from '../canvas/types'
import type { RepairReview } from '../healing/types'
import type { RunContext, RunRecord, SessionHistory, RepairEvent } from './types'

export function emptyHistory(): SessionHistory {
  return { runs: [], repairs: [], observedFrame: null, observedRunId: null, observedReview: null }
}

export function recordRun(history: SessionHistory, runId: string, inputLabel: string, frame: DemoRunFrame, context: RunContext, at: string): SessionHistory {
  if (history.observedFrame === frame && history.observedRunId === runId) return history
  const latest = history.runs.find((record) => record.runId === runId)
  const newAttempt = !latest || latest.frame.status !== 'running'
  const finishedAt = frame.status === 'running' ? null : at
  let runs: RunRecord[]
  if (newAttempt) {
    const attempt = (latest?.attempt ?? 0) + 1
    runs = [{
      id: `${runId}:${attempt}`, runId, attempt, inputLabel, startedAt: at, finishedAt,
      frame: structuredClone(frame), context: structuredClone(context),
    }, ...history.runs]
  } else {
    runs = history.runs.map((record) => record.id === latest.id
      ? { ...record, frame: structuredClone(frame), finishedAt } : record)
  }
  return { ...history, runs, observedFrame: frame, observedRunId: runId }
}

export function recordRepair(history: SessionHistory, review: RepairReview, stepTitle: string, at: string): SessionHistory {
  if (history.observedReview === review || !review.snapshot.frame.failure) return history
  const stepId = review.snapshot.frame.failure.stepId
  const id = `${review.snapshot.runId}:${stepId}`
  const previous = history.repairs.find((repair) => repair.id === id)
  const kind: RepairEvent['kind'] = review.decision === 'applied' ? 'applied'
    : review.decision === 'rejected' ? 'rejected'
    : previous?.decision === 'rejected' ? 'reopened'
    : review.checks ? review.checks.every((check) => check.passed) ? 'verified' : 'verification-failed'
    : 'opened'
  const event: RepairEvent = structuredClone({ kind, at, checks: review.checks, proposal: review.proposal })
  const record = {
    id, runId: review.snapshot.runId, stepId, stepTitle, decision: review.decision,
    snapshot: structuredClone(review.snapshot), checks: structuredClone(review.checks), proposal: structuredClone(review.proposal),
    events: [...(previous?.events ?? []), event],
  }
  return {
    ...history, repairs: previous ? history.repairs.map((repair) => repair.id === id ? record : repair) : [record, ...history.repairs],
    observedReview: review,
  }
}

export function filterRuns(runs: RunRecord[], query: string, status: string): RunRecord[] {
  const needle = query.trim().toLowerCase()
  return runs.filter((run) => (status === 'all' || run.frame.status === status) && (!needle ||
    [run.runId, run.inputLabel, run.context.plan.title, ...run.context.plan.steps.map((step) => step.title)].join(' ').toLowerCase().includes(needle)))
}
