import { useEffect, useState } from 'react'
import type { DemoRunFrame } from '../../canvas/types'
import type { RepairCheck, RepairProposal, RepairReview } from '../types'

export function useRepairReview(frame: DemoRunFrame | null, runId: string | null, scenarioLabel?: string) {
  const [review, setReview] = useState<RepairReview | null>(null)

  useEffect(() => {
    if (!runId) return
    if (frame?.status === 'failed' && frame.failure) {
      setReview((current) => current?.snapshot.frame === frame ? current : {
        snapshot: { runId, frame, scenarioLabel: scenarioLabel ?? 'Workflow run' }, decision: 'review', checks: null, proposal: null,
      })
    } else setReview((current) => current && current.snapshot.runId !== runId ? null : current)
  }, [frame, runId, scenarioLabel])

  function recordChecks(checks: RepairCheck[], proposal: RepairProposal) {
    setReview((current) => current?.decision === 'review' ? { ...current, checks, proposal } : current)
  }
  function decide(decision: RepairReview['decision']) {
    setReview((current) => current ? { ...current, decision, ...(decision === 'review' ? { checks: null, proposal: null } : {}) } : current)
  }

  return { review, recordChecks, decide }
}
