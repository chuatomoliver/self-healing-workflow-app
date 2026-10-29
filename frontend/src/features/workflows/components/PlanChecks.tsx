import { Icon } from '../../../components/ui/Icon'
import type { PlanCheck } from '../types'

const checkStates = {
  sample: { label: 'Sample', color: 'bg-accent-soft text-accent' },
  pending: { label: 'Pending', color: 'bg-slate-100 text-muted' },
  'needs-input': { label: 'Needs input', color: 'bg-amber-50 text-amber-800' },
  'not-run': { label: 'Not run', color: 'bg-slate-100 text-muted' },
}

export function PlanChecks({ checks }: { checks: PlanCheck[] }) {
  return <section className="min-w-0 rounded-xl border border-line bg-surface p-5 xl:p-6" aria-labelledby="plan-checks-heading">
    <h2 id="plan-checks-heading" className="text-sm font-semibold">Plan checks</h2>
    <p className="mt-2 mb-4 text-[11px] leading-relaxed text-muted">Illustrative review states. Runtime validation has not been performed.</p>
    <ul className="divide-y divide-line">
      {checks.map((check) => <li key={check.id} className="flex items-start gap-2.5 py-3.5">
        <Icon name="info" width="15" height="15" className="mt-0.5 shrink-0 text-slate-400" />
        <div className="min-w-0 flex-1"><p className="text-xs font-medium">{check.title}</p>
          <p className="mt-1 text-[10px] leading-relaxed text-muted">{check.description}</p>
        </div>
        <span className={`shrink-0 rounded-md px-2 py-1 text-[9px] font-medium ${checkStates[check.status].color}`}>{checkStates[check.status].label}</span>
      </li>)}
    </ul>
  </section>
}
