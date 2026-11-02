import type { RunStatus, WorkflowRun } from '../../../../shared/execution.ts'
import type { WorkflowRunsState } from './useWorkflowRuns'
import { Button } from '../../components/ui/Button'
import { localTime } from './presentation'

const states: Record<RunStatus, { label: string; color: string }> = {
  queued: { label: 'Queued', color: 'bg-slate-100 text-muted' }, preparing: { label: 'Preparing run', color: 'bg-accent-soft text-accent' },
  running: { label: 'Running', color: 'bg-accent-soft text-accent' }, succeeded: { label: 'Succeeded', color: 'bg-emerald-50 text-emerald-800' },
  failed: { label: 'Failed', color: 'bg-red-50 text-danger' }, unknown: { label: 'Needs check', color: 'bg-amber-50 text-amber-800' }, cancelled: { label: 'Stopped', color: 'bg-slate-100 text-muted' },
}
export function ExecutionStatus({ status, repaired = false }: { status?: RunStatus; repaired?: boolean }) {
  const state = status ? states[status] : { label: 'Not run', color: 'bg-slate-100 text-muted' }
  return <span className={`shrink-0 rounded-md px-2.5 py-1.5 text-[10px] font-medium ${state.color}`}>{status === 'succeeded' && repaired ? 'Recovered' : state.label}</span>
}
export function RunPicker({ execution }: { execution: WorkflowRunsState }) {
  return <div className="flex flex-wrap items-end gap-2"><label className="min-w-0 flex-1 text-[10px] font-medium">Saved runs<select aria-label="Saved runs" value={execution.selectedId} disabled={!execution.runs.length} onChange={(event) => execution.select(event.target.value)} className="mt-2 w-full min-w-0 rounded-md border border-line bg-surface px-3 py-2.5 text-[11px]">{!execution.runs.length && <option value="">No runs recorded</option>}{execution.runs.map((run) => <option key={run.id} value={run.id}>{localTime(run.createdAt)} · {states[run.status].label} · v{run.workflowVersion}</option>)}</select></label><Button variant="secondary" size="compact" onClick={execution.refresh}>Refresh</Button></div>
}
export function ExecutionEvents({ run }: { run: WorkflowRun | null }) {
  return <div className="mt-4 max-h-96 overflow-auto rounded-lg bg-slate-950 p-4" aria-label="Execution events">{run ? <ol className="grid gap-3">{run.events.map((event) => <li key={event.id} className="text-[10px] leading-relaxed"><time className="text-slate-500">{localTime(event.at)} · </time>{event.stepId && <span className="text-slate-400">{run.snapshot.plan.steps.find((step) => step.id === event.stepId)?.title} · </span>}<span className={event.level === 'error' ? 'text-red-300' : event.level === 'success' ? 'text-emerald-300' : 'text-slate-300'}>{event.message === 'Preparing executable steps with Muse. Saved versions reuse their validated configuration.' ? 'Loading execution setup for this saved version.' : event.message}</span></li>)}</ol> : <p className="py-12 text-center text-[11px] text-slate-400">Run your saved workflow to see its execution events here.</p>}</div>
}
