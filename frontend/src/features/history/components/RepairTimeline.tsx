import { Icon } from '../../../components/ui/Icon'
import { formatHistoryTime, repairEventLabels } from '../presentation'
import type { RepairRecord } from '../types'

export function RepairTimeline({ repairs }: { repairs: RepairRecord[] }) {
  if (!repairs.length) return <p className="py-6 text-[11px] text-muted">No repair decisions for this run.</p>
  return <div className="grid gap-4">
    {repairs.map((repair) => <article key={repair.id} className="min-w-0 rounded-lg border border-line p-4">
      <h3 className="text-xs font-semibold wrap-anywhere">{repair.stepId.toUpperCase()} · {repair.stepTitle}</h3>
      {repair.proposal && <p className="mt-2 flex flex-wrap items-center gap-2 text-[10px] leading-relaxed"><code className="text-danger">{repair.proposal.originalField}</code><Icon name="arrow" width="12" height="12" className="text-slate-400" /><code className="text-emerald-800">{repair.proposal.replacementField}</code><span className="text-muted">{repair.proposal.title}</span></p>}
      <ol className="mt-5 grid gap-4 border-l border-line pl-4">
        {repair.events.map((event, index) => <li key={`${index}-${event.kind}`} className="relative">
          <span className={`absolute -left-[20px] top-1 size-1.5 rounded-full ${event.kind === 'applied' ? 'bg-emerald-500' : event.kind === 'rejected' || event.kind === 'verification-failed' ? 'bg-amber-500' : 'bg-accent'}`} />
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[11px] font-medium">{repairEventLabels[event.kind]}</p><time dateTime={event.at} className="text-[9px] text-muted">{formatHistoryTime(event.at)}</time></div>
          {event.checks && <p className="mt-1 text-[10px] text-muted">{event.checks.filter((check) => check.passed).length} / {event.checks.length} checks passed</p>}
        </li>)}
      </ol>
    </article>)}
  </div>
}
