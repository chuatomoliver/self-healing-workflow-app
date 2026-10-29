import { Icon } from '../../../components/ui/Icon'
import { NodeRoleBadge } from '../../diagram-parsing/components/NodeRoleBadge'
import type { PlanStep } from '../types'

type PlanStepListProps = {
  steps: PlanStep[]
  selectedStepId: string | null
  onSelectStep: (id: string) => void
}

export function PlanStepList({ steps, selectedStepId, onSelectStep }: PlanStepListProps) {
  return <section className="min-w-0 rounded-xl border border-line bg-surface p-5 xl:p-6" aria-labelledby="steps-heading">
    <div className="mb-1 flex items-center justify-between gap-3">
      <h2 id="steps-heading" className="text-sm font-semibold">Proposed steps</h2>
      <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] text-muted">{steps.length} steps</span>
    </div>
    <p className="mb-5 text-[11px] leading-relaxed text-muted">Inspect what each step will do and what it needs.</p>
    <ol className="grid gap-2.5">
      {steps.map((step, index) => <li key={step.id}>
        <button type="button" aria-pressed={step.id === selectedStepId} aria-controls="plan-step-details" onClick={() => onSelectStep(step.id)}
          className={`flex w-full cursor-pointer items-start gap-3 rounded-lg border p-3.5 text-left transition-[background-color,border-color] duration-200 motion-reduce:transition-none ${step.id === selectedStepId ? 'border-accent/30 bg-accent-soft/60' : 'border-line hover:border-accent/30 hover:bg-slate-50'}`}>
          <span className={`grid size-7 shrink-0 place-items-center rounded-md text-[10px] font-semibold ${step.id === selectedStepId ? 'bg-accent text-white' : 'bg-slate-100 text-muted'}`}>
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs leading-relaxed font-semibold">{step.title}</span>
            <span className="mt-1 block text-[10px] leading-relaxed text-muted">{step.operation}</span>
            <span className="mt-2 inline-flex"><NodeRoleBadge role={step.role} /></span>
          </span>
          <Icon name="arrow" width="14" height="14" className="mt-1.5 shrink-0 text-slate-400" />
        </button>
      </li>)}
    </ol>
    {steps.length === 0 && <p className="py-6 text-xs text-muted">Proposed steps will appear here.</p>}
  </section>
}
