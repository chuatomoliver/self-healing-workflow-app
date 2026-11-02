import { useCallback, useEffect, useRef, useState } from 'react'
import type { RunData, RunSummary, WorkflowRun } from '../../../../shared/execution.ts'
import { cancelRun, decideRepair, getRun, listRuns, proposeRepair, startRun } from './api'

export const runActive = (run: WorkflowRun | null) => !!run && (['queued', 'preparing', 'running'].includes(run.status) || run.repairs.some((repair) => repair.status === 'generating'))
export function useWorkflowRuns(workflowId: string | undefined, version: number | undefined) {
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [run, setRun] = useState<WorkflowRun | null>(null)
  const [selectedId, setSelectedId] = useState(() => new URLSearchParams(window.location.search).get('run') ?? '')
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  const [refreshCount, setRefreshCount] = useState(0)
  const mutation = useRef(false)
  const pendingStart = useRef<{ fingerprint: string; id: string } | null>(null)
  useEffect(() => {
    if (!workflowId) return
    let stopped = false; let timer: ReturnType<typeof setTimeout> | undefined
    const controller = new AbortController()
    const poll = async () => {
      let delay = 15000
      try {
        const history = await listRuns(workflowId, controller.signal)
        const id = selectedId || history[0]?.id
        const detail = id ? await getRun(id, controller.signal) : null
        if (detail && detail.workflowId !== workflowId) throw new Error('Choose a run belonging to this workflow.')
        if (!stopped) { setRuns(history); setRun(detail); setLoadError(''); if (!selectedId && id) setSelectedId(id) }
        if (runActive(detail)) delay = 800
      } catch (cause) { if (!stopped && !controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : 'Run history could not be loaded.') }
      finally { if (!stopped) timer = setTimeout(() => { void poll() }, delay) }
    }
    void poll()
    return () => { stopped = true; controller.abort(); if (timer) clearTimeout(timer) }
  }, [workflowId, selectedId, refreshCount])
  const refresh = useCallback(() => setRefreshCount((value) => value + 1), [])
  async function action(operation: () => Promise<WorkflowRun>) {
    if (mutation.current) return
    mutation.current = true; setBusy(true); setError('')
    try { const next = await operation(); setRun(next); setSelectedId(next.id); refresh() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'This operation could not finish.'); refresh() }
    finally { mutation.current = false; setBusy(false) }
  }
  return {
    runs, run, selectedId, error: error || loadError, busy, active: runActive(run), refresh,
    select: (id: string) => { setSelectedId(id); setRun(null) },
    start: async (input: RunData, autoRepair = true) => {
      if (!workflowId || !version) return
      const fingerprint = JSON.stringify([workflowId, version, input, autoRepair])
      if (pendingStart.current?.fingerprint !== fingerprint) pendingStart.current = { fingerprint, id: crypto.randomUUID() }
      const requestId = pendingStart.current.id
      await action(async () => { const result = await startRun(workflowId, version, input, requestId, autoRepair); pendingStart.current = null; return result })
    },
    cancel: () => run ? action(() => cancelRun(run.id)) : Promise.resolve(),
    repair: () => run ? action(() => proposeRepair(run.id, run.revision, crypto.randomUUID())) : Promise.resolve(),
    decide: (repairId: string, decision: 'reject' | 'resume') => run ? action(() => decideRepair(run.id, repairId, run.revision, decision)) : Promise.resolve(),
  }
}
export type WorkflowRunsState = ReturnType<typeof useWorkflowRuns>
