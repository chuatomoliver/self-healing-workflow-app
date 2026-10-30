import { useEffect, useState } from 'react'
import type { DemoRunFrame } from '../../canvas/types'
import type { RepairReview } from '../../healing/types'
import type { PlanStep, WorkflowPlan } from '../../workflows/types'
import { emptyHistory, recordRepair, recordRun } from '../journal'

type HistoryInput = {
  frame: DemoRunFrame | null
  runId: string | null
  inputLabel?: string
  plan: WorkflowPlan
  steps: PlanStep[]
  prompt: string
  diagram: File | null
  review: RepairReview | null
}

export function useSessionHistory({ frame, runId, inputLabel, plan, steps, prompt, diagram, review }: HistoryInput) {
  const [history, setHistory] = useState(emptyHistory)

  useEffect(() => {
    if (!frame || !runId) return
    const context = {
      plan: { ...plan, steps }, prompt,
      diagram: diagram ? { name: diagram.name, size: diagram.size, type: diagram.type } : null,
    }
    const at = new Date().toISOString()
    setHistory((current) => recordRun(current, runId, inputLabel ?? 'Workflow run', frame, context, at))
  }, [frame, runId, inputLabel, plan, steps, prompt, diagram])

  useEffect(() => {
    if (!review) return
    const stepId = review.snapshot.frame.failure?.stepId
    const stepTitle = steps.find((step) => step.id === stepId)?.title ?? stepId ?? 'Workflow step'
    const at = new Date().toISOString()
    setHistory((current) => recordRepair(current, review, stepTitle, at))
  }, [review, steps])

  return { runs: history.runs, repairs: history.repairs }
}
