import { formatHistoryTime, formatRunDuration, runStatusStyles } from '../presentation'
import type { RunRecord } from '../types'
import { RunStatusBadge } from './RunStatusBadge'

export function RunHistoryList({ runs, selectedId, onSelect }: { runs: RunRecord[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return <>
    <div className="hidden grid-cols-[1fr_1.7fr_0.8fr_1.5fr_0.7fr] gap-3 border-b border-line px-3 py-3 text-[9px] font-medium text-muted sm:grid" aria-hidden="true"><span>Run / attempt</span><span>Input</span><span>Status</span><span>Started · Manila</span><span className="text-right">Duration</span></div>
    <ol className="divide-y divide-line">
      {runs.map((run) => <li key={run.id}>
        <button type="button" onClick={() => onSelect(run.id)} aria-pressed={selectedId === run.id} aria-controls="history-run-details"
          aria-label={`${run.runId}, ${run.attempt === 1 ? 'initial run' : `replay ${run.attempt - 1}`}, ${runStatusStyles[run.frame.status].label}`}
          className={`grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-lg p-3 text-left transition-colors duration-200 motion-reduce:transition-none sm:grid-cols-[1fr_1.7fr_0.8fr_1.5fr_0.7fr] ${selectedId === run.id ? 'bg-accent-soft/70' : 'hover:bg-slate-50'}`}>
          <span className="min-w-0"><span className="block text-[11px] font-semibold wrap-anywhere">{run.runId}</span><span className="mt-1 block text-[9px] text-muted">{run.attempt === 1 ? 'Initial run' : `Replay ${run.attempt - 1}`}</span></span>
          <span className="order-3 col-span-2 min-w-0 text-[10px] leading-relaxed text-muted sm:order-none sm:col-span-1">{run.inputLabel}</span>
          <span className="order-2 justify-self-end sm:order-none sm:justify-self-start"><RunStatusBadge status={run.frame.status} /></span>
          <time dateTime={run.startedAt} className="order-4 text-[9px] leading-relaxed text-muted sm:order-none">{formatHistoryTime(run.startedAt)}</time>
          <span className="order-5 text-right text-[9px] text-muted sm:order-none">{formatRunDuration(run.startedAt, run.finishedAt)}</span>
        </button>
      </li>)}
    </ol>
  </>
}
