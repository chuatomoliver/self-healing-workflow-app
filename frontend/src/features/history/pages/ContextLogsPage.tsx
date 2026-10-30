import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { workflowRoutes } from '../../../app/navigation'
import { Button } from '../../../components/ui/Button'
import { Icon } from '../../../components/ui/Icon'
import { RunDetails } from '../components/RunDetails'
import { RunHistoryList } from '../components/RunHistoryList'
import { filterRuns } from '../journal'
import { formatHistoryTime } from '../presentation'
import type { RepairRecord, RunRecord } from '../types'

type ContextLogsPageProps = { runs: RunRecord[]; repairs: RepairRecord[] }

export function ContextLogsPage({ runs, repairs }: ContextLogsPageProps) {
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const filtered = filterRuns(runs, query, status)
  const requestedRun = params.get('run')
  const selected = filtered.find((run) => run.id === requestedRun || run.runId === requestedRun) ?? filtered[0] ?? null
  const requestedView = params.get('view')
  const view = requestedView === 'repairs' || requestedView === 'context' ? requestedView : 'execution'
  const selectRun = (id: string) => setParams({ run: id, view })
  const stats = [
    { label: 'Run attempts', value: runs.length },
    { label: 'Succeeded', value: runs.filter((run) => run.frame.status === 'succeeded').length },
    { label: 'Failed', value: runs.filter((run) => run.frame.status === 'failed').length },
    { label: 'Applied repairs', value: repairs.filter((repair) => repair.decision === 'applied').length },
  ]

  return <>
    <div className="text-[9px] font-semibold tracking-[1.5px] text-muted">WORKFLOW BUILDER</div>
    <header className="mt-8 mb-7 md:mt-10 md:mb-8">
      <p className="mb-4 flex items-center gap-2 text-[10px] font-bold tracking-[1.4px] text-accent"><span className="size-1.5 rounded-full bg-accent" />STEP 6 OF 6 · CONTEXT & LOGS</p>
      <h1 className="mb-4 text-[clamp(1.875rem,3vw,2.625rem)] leading-tight font-[650] tracking-[-1.3px]">Every run, in context.</h1>
      <p className="max-w-2xl text-xs leading-[1.8] text-muted md:text-[13px]">Inspect executions, outputs, and repair decisions.</p>
    </header>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((stat) => <div key={stat.label} className="rounded-xl border border-line bg-surface p-4"><p className="text-xl font-semibold tracking-tight">{stat.value}</p><p className="mt-1 text-[10px] text-muted">{stat.label}</p></div>)}
    </div>

    <section className="mt-5 min-w-0 rounded-xl border border-line bg-surface p-5 xl:p-6" aria-labelledby="run-history-heading">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="run-history-heading" className="text-sm font-semibold">Run history</h2><span className="rounded-md bg-slate-100 px-2 py-1 text-[9px] text-muted">{filtered.length} / {runs.length} attempts</span></div>
      {runs.length > 0 ? <>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-48"><label htmlFor="history-search" className="text-[10px] font-medium">Search runs</label><input id="history-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Run ID, input, or step name" className="mt-2 w-full min-w-0 rounded-md border border-line bg-surface px-3 py-2.5 text-[11px] outline-none focus:border-accent focus:ring-3 focus:ring-accent/10" /></div>
          <div><label htmlFor="history-status" className="text-[10px] font-medium">Status</label><select id="history-status" value={status} onChange={(event) => setStatus(event.target.value)} className="mt-2 block rounded-md border border-line bg-surface px-3 py-2.5 text-[11px] outline-none focus:border-accent focus:ring-3 focus:ring-accent/10"><option value="all">All statuses</option><option value="succeeded">Succeeded</option><option value="failed">Failed</option><option value="stopped">Stopped</option><option value="running">Running</option></select></div>
          {(query || status !== 'all') && <Button variant="text" size="compact" onClick={() => { setQuery(''); setStatus('all') }}>Clear filters</Button>}
        </div>
        <div className="mt-4"><RunHistoryList runs={filtered} selectedId={selected?.id ?? null} onSelect={selectRun} /></div>
        {filtered.length === 0 && <p className="py-8 text-center text-[11px] text-muted">No matching runs.</p>}
      </> : <div className="py-10 text-center"><Icon name="file" width="24" height="24" className="mx-auto text-accent" /><h3 className="mt-4 text-sm font-semibold">No runs yet</h3><Link to={workflowRoutes.canvas} className="mt-5 inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-accent-hover">Open canvas<Icon name="arrow" width="14" height="14" /></Link></div>}
    </section>

    {selected && <RunDetails key={selected.id} run={selected} repairs={repairs.filter((repair) => repair.runId === selected.runId)} view={view} onViewChange={(nextView) => setParams({ run: selected.id, view: nextView })} />}

    {runs.length > 0 && <section className="mt-5 rounded-xl border border-line bg-surface p-5 xl:p-6" aria-labelledby="repair-history-heading">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="repair-history-heading" className="text-sm font-semibold">Repair history</h2><span className="rounded-md bg-slate-100 px-2 py-1 text-[9px] text-muted">{repairs.length} {repairs.length === 1 ? 'review' : 'reviews'}</span></div>
      {repairs.length === 0 ? <p className="mt-4 text-[11px] text-muted">No repair reviews recorded.</p> : <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {repairs.map((repair) => {
          const applied = repair.decision === 'applied'
          const verified = repair.checks?.length && repair.checks.every((check) => check.passed)
          const label = applied ? 'Applied' : repair.decision === 'rejected' ? 'Rejected' : verified ? 'Verified' : 'Needs review'
          return <article key={repair.id} className="min-w-0 rounded-lg border border-line p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="min-w-0 text-[11px] font-semibold wrap-anywhere">{repair.stepId.toUpperCase()} · {repair.stepTitle}</h3><span className={`rounded-md px-2 py-1 text-[9px] font-medium ${applied ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-muted'}`}>{label}</span></div>
            <p className="mt-2 text-[10px] text-muted">{repair.runId} · {repair.events.length} decisions</p>
            <p className="mt-1 text-[9px] text-muted">{formatHistoryTime(repair.events.at(-1)!.at)} · Manila</p>
            <Button variant="text" size="inline" className="mt-3" onClick={() => { setQuery(''); setStatus('all'); setParams({ run: repair.runId, view: 'repairs' }) }}>View decisions<Icon name="arrow" width="12" height="12" /></Button>
          </article>
        })}
      </div>}
    </section>}

    <div className="mt-7 flex flex-wrap items-center justify-between gap-4"><Link to={workflowRoutes.canvas} className="inline-flex items-center gap-2 rounded-md border border-line bg-surface px-4 py-3 text-xs font-semibold transition-colors hover:bg-slate-50"><Icon name="back" width="15" height="15" />Back to canvas</Link><Link to={workflowRoutes.plan} className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold text-accent hover:underline">Review plan<Icon name="arrow" width="14" height="14" /></Link></div>
    <footer className="mt-8 flex items-center justify-between border-t border-line pt-5 text-[8px] tracking-[1.5px] text-muted md:mt-10"><span>CONTEXT & LOGS</span><span className="font-semibold tracking-wide text-accent">06 <span className="mx-2 text-slate-400">/</span> 06</span></footer>
  </>
}
