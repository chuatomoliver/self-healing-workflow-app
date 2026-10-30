import { useState } from 'react'
import { canvasStepStates } from '../../canvas/presentation'
import type { RepairRecord, RunRecord } from '../types'
import { formatHistoryTime, formatRunDuration } from '../presentation'
import { RepairTimeline } from './RepairTimeline'
import { RunStatusBadge } from './RunStatusBadge'

type DetailView = 'execution' | 'repairs' | 'context'
type RunDetailsProps = { run: RunRecord; repairs: RepairRecord[]; view: DetailView; onViewChange: (view: DetailView) => void }

export function RunDetails({ run, repairs, view, onViewChange }: RunDetailsProps) {
  const steps = run.context.plan.steps
  const defaultStepId = run.frame.failure?.stepId ?? [...steps].reverse().find((step) => run.frame.stepStates[step.id] === 'succeeded')?.id ?? steps[0]?.id ?? ''
  const [stepId, setStepId] = useState(defaultStepId)
  const [level, setLevel] = useState('all')
  const step = steps.find((item) => item.id === stepId)
  const output = run.frame.outputs[stepId]
  const state = canvasStepStates[run.frame.stepStates[stepId] ?? 'idle']
  const events = run.frame.events.filter((event) => level === 'all' || event.level === level)

  return <section id="history-run-details" className="mt-5 min-w-0 rounded-xl border border-line bg-surface p-5 wrap-anywhere xl:p-6" aria-labelledby="history-run-details-heading">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="history-run-details-heading" className="text-sm font-semibold">{run.runId} · {run.attempt === 1 ? 'Initial run' : `Replay ${run.attempt - 1}`}</h2><p className="mt-2 text-[11px] leading-relaxed text-muted">{run.inputLabel}</p></div><RunStatusBadge status={run.frame.status} /></div>
    <dl className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-3.5 text-[10px] sm:grid-cols-3">
      {[{ title: 'Started · Manila', value: formatHistoryTime(run.startedAt) }, { title: 'Finished · Manila', value: run.finishedAt ? formatHistoryTime(run.finishedAt) : 'In progress' }, { title: 'Duration', value: formatRunDuration(run.startedAt, run.finishedAt) }].map((item) => <div key={item.title}><dt className="text-[9px] text-muted">{item.title}</dt><dd className="mt-1 font-medium">{item.value}</dd></div>)}
    </dl>
    <div className="mt-5 flex flex-wrap gap-2 border-b border-line pb-3" role="group" aria-label="Run detail view">
      {([{ id: 'execution', label: 'Execution' }, { id: 'repairs', label: `Repair decisions (${repairs.reduce((count, repair) => count + repair.events.length, 0)})` }, { id: 'context', label: 'Workflow context' }] as const).map((item) => <button key={item.id} type="button" aria-pressed={view === item.id} aria-controls="history-detail-panel" onClick={() => onViewChange(item.id)} className={`cursor-pointer rounded-md px-3 py-2 text-[10px] font-semibold transition-colors duration-200 motion-reduce:transition-none ${view === item.id ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-slate-50 hover:text-ink'}`}>{item.label}</button>)}
    </div>
    <div id="history-detail-panel" className="mt-5">
      {view === 'execution' && <>
        {run.frame.failure && <p className="mb-4 rounded-lg bg-red-50 p-3 text-[11px] leading-relaxed text-danger">{run.frame.failure.message}</p>}
        <div className="grid items-start gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="min-w-0">
            <label htmlFor="history-step" className="text-[11px] font-semibold">Inspect step</label>
            <select id="history-step" value={stepId} onChange={(event) => setStepId(event.target.value)} className="mt-2 w-full min-w-0 rounded-md border border-line bg-surface px-3 py-2.5 text-[11px] outline-none focus:border-accent focus:ring-3 focus:ring-accent/10">
              {steps.map((item, index) => <option key={item.id} value={item.id}>{String(index + 1).padStart(2, '0')} · {item.title}</option>)}
            </select>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] text-muted">{step?.operation}</span><span className={`rounded-md px-2 py-1 text-[9px] font-medium ${state.colors}`}>{state.label}</span></div>
            <h3 className="mt-4 text-[11px] font-semibold">Output</h3>
            {output ? <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-slate-950 p-3 text-[10px] leading-[1.8] text-slate-200"><code>{JSON.stringify(output, null, 2)}</code></pre> : <p className="mt-2 text-[10px] text-muted">No output for this step.</p>}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-[11px] font-semibold">Execution events · {events.length}</h3><div className="flex items-center gap-2"><label htmlFor="history-event-level" className="text-[9px] text-muted">Level</label><select id="history-event-level" value={level} onChange={(event) => setLevel(event.target.value)} className="rounded-md border border-line bg-surface px-2 py-1.5 text-[10px] outline-none focus:border-accent focus:ring-3 focus:ring-accent/10"><option value="all">All levels</option><option value="error">Errors</option><option value="success">Success</option><option value="info">Info</option></select></div></div>
            <div tabIndex={0} aria-label="Recorded execution events" className="mt-3 max-h-96 overflow-auto rounded-lg bg-slate-950 p-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus">
              <ol className="grid gap-4">{events.map((event, index) => <li key={`${index}-${event.stepId}`} className="text-[10px] leading-relaxed"><p className={`font-medium ${event.level === 'error' ? 'text-red-300' : event.level === 'success' ? 'text-emerald-300' : 'text-slate-200'}`}>{event.stepId.toUpperCase()} · {steps.find((item) => item.id === event.stepId)?.title ?? 'Run control'}</p><p className="mt-1 wrap-anywhere text-slate-400">{event.message}</p></li>)}</ol>
              {events.length === 0 && <p className="py-6 text-center text-[10px] text-slate-400">No events at this level.</p>}
            </div>
          </div>
        </div>
      </>}
      {view === 'repairs' && <RepairTimeline repairs={repairs} />}
      {view === 'context' && <div className="grid gap-4">
        <div className="rounded-lg border border-line p-4"><h3 className="text-xs font-semibold">Original input</h3><p className="mt-3 text-[11px] leading-relaxed whitespace-pre-wrap wrap-anywhere text-muted">{run.context.prompt.trim() || 'No description provided.'}</p>{run.context.diagram && <p className="mt-3 text-[10px] wrap-anywhere text-muted">Diagram: {run.context.diagram.name} · {(run.context.diagram.size / 1024).toFixed(1)} KB</p>}</div>
        <div className="rounded-lg border border-line p-4"><h3 className="text-xs font-semibold">Workflow</h3><p className="mt-2 text-[11px] text-muted">{run.context.plan.title} · {steps.length} steps · {run.context.plan.edges.length} paths</p><ol className="mt-4 grid gap-3">{steps.map((item) => <li key={item.id} className="text-[11px]"><span className="font-medium">{item.id.toUpperCase()} · {item.title}</span><p className="mt-1 text-[10px] text-muted">{item.operation}</p>{item.mappings.length > 0 && <details className="mt-2"><summary className="cursor-pointer text-[10px] font-medium text-accent">Field mappings</summary><ul className="mt-2 grid gap-1.5">{item.mappings.map((mapping) => <li key={`${mapping.source}-${mapping.target}`} className="text-[10px] leading-relaxed wrap-anywhere text-muted"><code>{mapping.source}</code> → <code>{mapping.target}</code></li>)}</ul></details>}</li>)}</ol></div>
        <details className="rounded-lg border border-line p-4"><summary className="cursor-pointer text-[11px] font-semibold">Webhook configuration · {run.context.plan.webhooks.length}</summary><div className="mt-4 grid gap-4">{run.context.plan.webhooks.map((webhook) => <div key={webhook.id} className="min-w-0"><h4 className="text-[11px] font-medium">{webhook.name}</h4><p className="mt-1 text-[10px] wrap-anywhere text-muted">{webhook.method} · {webhook.endpoint.urlTemplate}</p><pre className="mt-2 max-h-60 overflow-auto rounded-lg bg-slate-950 p-3 text-[10px] leading-[1.8] text-slate-200"><code>{JSON.stringify(webhook.payloadTemplate, null, 2)}</code></pre></div>)}</div></details>
      </div>}
    </div>
  </section>
}
