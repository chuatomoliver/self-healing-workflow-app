import { useEffect, useRef } from 'react'
import { Button } from '../../../components/ui/Button'
import { Icon } from '../../../components/ui/Icon'
import type { PlanStep } from '../../workflows/types'
import type { DemoRunFrame } from '../types'

type DemoExecutionLogProps = {
  frame: DemoRunFrame | null
  runId: string | null
  scenarioLabel?: string
  steps: PlanStep[]
  onInspectFailure: (stepId: string) => void
}

export function DemoExecutionLog({ frame, runId, scenarioLabel, steps, onInspectFailure }: DemoExecutionLogProps) {
  const logRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [frame?.events.length])
  const successCount = Object.values(frame?.stepStates ?? {}).filter((state) => state === 'succeeded').length
  const skippedCount = Object.values(frame?.stepStates ?? {}).filter((state) => state === 'skipped').length
  const summary = !frame ? ''
    : frame.status === 'running' ? 'Running…'
    : frame.status === 'succeeded' ? `Completed · ${successCount} steps succeeded · ${skippedCount} skipped.`
    : frame.status === 'failed' ? `Failed at ${steps.find((step) => step.id === frame.failure?.stepId)?.title ?? 'a step'}.`
    : 'Run stopped.'

  return <section className="min-w-0 rounded-xl border border-line bg-surface p-5 xl:p-6" aria-labelledby="execution-log-heading">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="execution-log-heading" className="text-sm font-semibold">Execution log</h2><span className="rounded-md bg-accent-soft px-2 py-1 text-[9px] font-medium text-accent">{runId ?? 'No run yet'}</span></div>
    {scenarioLabel && <p className="mt-2 text-[11px] leading-relaxed text-muted">{scenarioLabel}</p>}
    <p role="status" aria-live="polite" className={frame ? `mt-4 rounded-lg p-3 text-[11px] leading-relaxed ${frame.status === 'failed' ? 'bg-red-50 text-danger' : frame.status === 'succeeded' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-muted'}` : 'sr-only'}>{summary}</p>
    <div ref={logRef} className="mt-4 max-h-80 overflow-auto rounded-lg bg-slate-950 p-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus" tabIndex={0} aria-label="Execution events">
      {!frame && <div className="grid min-h-44 place-content-center gap-3 text-center text-slate-400"><Icon name="bolt" className="mx-auto text-slate-500" /><p className="text-[11px]">Run the workflow to view events.</p></div>}
      {frame && <ol className="grid gap-4">{frame.events.map((event, index) => <li key={`${index}-${event.stepId}`} className="flex items-start gap-3 text-[10px] leading-relaxed">
        <span className="shrink-0 font-mono text-slate-500">{String(index + 1).padStart(2, '0')}</span>
        <div className="min-w-0"><p className={`font-medium ${event.level === 'error' ? 'text-red-300' : event.level === 'success' ? 'text-emerald-300' : 'text-slate-200'}`}>{event.stepId.toUpperCase()} · {steps.find((step) => step.id === event.stepId)?.title ?? 'Run control'}</p><p className="mt-1 wrap-anywhere text-slate-400">{event.message}</p></div>
      </li>)}</ol>}
    </div>
    {frame?.failure && <div className="mt-4 rounded-lg border border-red-200 bg-red-50/60 p-4">
      <p className="flex items-center gap-2 text-xs font-semibold text-danger"><Icon name="info" width="15" height="15" />Delivery failure</p>
      <p className="mt-2 text-[11px] leading-relaxed text-danger">{frame.failure.message}</p>
      <Button variant="text" size="inline" className="mt-3" onClick={() => onInspectFailure(frame.failure!.stepId)}>Inspect failed step<Icon name="arrow" width="12" height="12" /></Button>
    </div>}
  </section>
}
