import { useState } from 'react'
import { Link } from 'react-router'
import { workflowRoutes } from '../../../app/navigation'
import { Button } from '../../../components/ui/Button'
import { Icon } from '../../../components/ui/Icon'
import type { DemoRunFrame } from '../../canvas/types'
import type { PlanStep, WorkflowPlan } from '../../workflows/types'
import { RepairPayloadDiff } from '../components/RepairPayloadDiff'
import { RepairVerification } from '../components/RepairVerification'
import { sampleRepairContract } from '../data/sampleRepairContract'
import { applyRepairToPlan, createRepairProposal, createRepairReplay, verifyRepair } from '../repair'
import type { RepairCheck, RepairProposal, RepairReview } from '../types'

type SelfHealPageProps = {
  plan: WorkflowPlan
  steps: PlanStep[]
  review: RepairReview | null
  currentFrame: DemoRunFrame | null
  onVerify: (checks: RepairCheck[], proposal: RepairProposal) => void
  onReopen: () => void
  onReject: () => void
  onApply: (nextPlan: WorkflowPlan, frames: DemoRunFrame[], sourceFrame: DemoRunFrame) => void
}

const canvasLinkClasses = 'inline-flex items-center gap-2 rounded-md border border-line bg-surface px-4 py-3 text-xs font-semibold transition-colors duration-200 hover:bg-slate-50 motion-reduce:transition-none'

export function SelfHealPage({ plan, steps, review, currentFrame, onVerify, onReopen, onReject, onApply }: SelfHealPageProps) {
  const [actionError, setActionError] = useState('')
  const failure = review?.snapshot.frame.failure
  const step = steps.find((item) => item.id === failure?.stepId)
  const proposal = review ? review.proposal ?? createRepairProposal(plan, review.snapshot) : null
  const verified = review?.checks?.length === 4 && review.checks.every((check) => check.passed)
  const applied = review?.decision === 'applied'
  const rejected = review?.decision === 'rejected'
  const status = applied ? 'Applied' : rejected ? 'Rejected' : verified ? 'Ready to apply' : 'Needs review'

  function apply() {
    if (!review || !proposal || !verified || review.decision !== 'review') return
    try {
      const nextPlan = applyRepairToPlan(plan, proposal)
      const frames = createRepairReplay(review.snapshot, proposal)
      onApply(nextPlan, frames, review.snapshot.frame)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to apply this repair.')
    }
  }

  return <>
    <div className="text-[9px] font-semibold tracking-[1.5px] text-muted">WORKFLOW BUILDER</div>
    <header className="mt-8 mb-7 md:mt-10 md:mb-8">
      <p className="mb-4 flex items-center gap-2 text-[10px] font-bold tracking-[1.4px] text-accent"><span className="size-1.5 rounded-full bg-accent" />STEP 5 OF 6 · WORKFLOW REPAIR</p>
      <h1 className="mb-4 text-[clamp(1.875rem,3vw,2.625rem)] leading-tight font-[650] tracking-[-1.3px]">Review the repair.</h1>
      <p className="max-w-2xl text-xs leading-[1.8] text-muted md:text-[13px]">Inspect the proposed change before resuming the workflow.</p>
    </header>

    {!review || !failure ? <section className="rounded-xl border border-line bg-surface px-6 py-12 text-center">
      <span className="mx-auto grid size-11 place-items-center rounded-xl bg-accent-soft text-accent"><Icon name="check" width="23" height="23" /></span>
      <h2 className="mt-5 text-base font-semibold">No failures to review</h2>
      <Link to={workflowRoutes.canvas} className={`${canvasLinkClasses} mt-6`}>Open canvas<Icon name="arrow" width="15" height="15" /></Link>
    </section> : <>
      <section className="rounded-xl border border-line bg-surface p-5 xl:p-6" aria-labelledby="repair-summary-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 id="repair-summary-heading" className="text-sm font-semibold">{plan.title}</h2><p className="mt-2 text-[10px] text-muted">{review.snapshot.runId} · {failure.stepId.toUpperCase()} · {step?.title ?? failure.stepId}</p></div>
          <span className={`rounded-md px-2.5 py-1.5 text-[10px] font-medium ${applied ? 'bg-emerald-50 text-emerald-800' : rejected ? 'bg-slate-100 text-muted' : verified ? 'bg-accent-soft text-accent' : 'bg-amber-50 text-amber-800'}`}>{status}</span>
        </div>
        <div className={`mt-4 flex items-start gap-2.5 rounded-lg p-3.5 ${applied ? 'bg-slate-50 text-muted' : 'bg-red-50 text-danger'}`}>
          <Icon name="info" width="16" height="16" className="mt-0.5 shrink-0" /><div><p className="text-xs font-semibold">{applied ? 'Original failure' : proposal ? 'Payload field mismatch' : 'Step failure'}</p><p className="mt-1 text-[11px] leading-relaxed">{failure.message}</p></div>
        </div>
        <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
          {[{ label: 'Failed operation', value: step?.operation ?? 'Webhook delivery' }, { label: 'Response', value: `HTTP ${String(review.snapshot.frame.outputs[failure.stepId]?.statusCode ?? '—')}` }, { label: 'Repair scope', value: 'Failed step only' }].map((item) => <div key={item.label}><p className="text-[9px] text-muted">{item.label}</p><p className="mt-1 text-[11px] leading-relaxed font-medium">{item.value}</p></div>)}
        </div>
        <details className="mt-4 border-t border-line pt-3"><summary className="cursor-pointer text-[11px] font-medium">Failure context</summary>
          <pre className="mt-3 max-h-60 overflow-auto rounded-lg bg-slate-950 p-4 text-[10px] leading-[1.8] text-slate-200"><code>{JSON.stringify(review.snapshot.frame.outputs[failure.stepId], null, 2)}</code></pre>
          <ol className="mt-3 grid gap-2">{review.snapshot.frame.events.map((event, index) => <li key={`${index}-${event.stepId}`} className={`text-[10px] leading-relaxed ${event.level === 'error' ? 'text-danger' : 'text-muted'}`}><span className="mr-2 font-mono">{event.stepId.toUpperCase()}</span>{event.message}</li>)}</ol>
        </details>
      </section>

      {proposal ? <>
        <RepairPayloadDiff proposal={proposal} />
        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[0.85fr_1.15fr]">
          <section className="min-w-0 rounded-xl border border-line bg-surface p-5 xl:p-6" aria-labelledby="receiver-contract-heading">
            <h2 id="receiver-contract-heading" className="text-sm font-semibold">Receiver contract</h2><p className="mt-2 text-[11px] text-muted">{sampleRepairContract.name}</p>
            <table className="mt-4 w-full text-left text-[10px] leading-relaxed"><thead><tr className="border-b border-line text-[9px] text-muted"><th className="pb-2 font-medium">Field</th><th className="pb-2 font-medium">Type</th><th className="pb-2 text-right font-medium">Required</th></tr></thead><tbody>
              {sampleRepairContract.fields.map((field) => <tr key={field.name} className="border-b border-line last:border-0"><td className="py-3 font-mono text-accent">{field.name}</td><td className="py-3 text-muted">{field.type}</td><td className="py-3 text-right">Yes</td></tr>)}
            </tbody></table>
          </section>
          <RepairVerification checks={review.checks} locked={applied || rejected} onVerify={() => { setActionError(''); onVerify(verifyRepair(proposal), proposal) }} />
        </div>
      </> : <section className="mt-5 rounded-xl border border-line bg-surface p-6 text-xs text-muted">No repair proposal available for this failure.</section>}

      {actionError && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-[11px] leading-relaxed text-danger">{actionError}</p>}
      <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
        <Link to={workflowRoutes.canvas} className={canvasLinkClasses}><Icon name="back" width="16" height="16" />Back to canvas</Link>
        {proposal && !applied && <div className="flex flex-wrap items-center gap-3">{rejected ? <Button variant="secondary" onClick={onReopen}>Review again</Button> : <>
          <Button variant="secondary" onClick={onReject}>Reject & keep editing</Button>
          <div className="flex flex-col items-end gap-2"><Button disabled={!verified || currentFrame !== review.snapshot.frame} onClick={apply} aria-describedby={!verified ? 'repair-verification-required' : undefined}>Apply repair & resume<Icon name="arrow" width="16" height="16" /></Button>{!verified && <p id="repair-verification-required" className="text-[10px] text-muted">Verify the repair first</p>}</div>
        </>}</div>}
        {applied && <span role="status" className="flex items-center gap-2 text-[11px] font-medium text-emerald-800"><Icon name="check" width="16" height="16" />Repair applied</span>}
      </div>
    </>}
    <footer className="mt-8 flex items-center justify-between border-t border-line pt-5 text-[8px] tracking-[1.5px] text-muted md:mt-10"><span>SELF-HEAL</span><span className="font-semibold tracking-wide text-accent">05 <span className="mx-2 text-slate-400">/</span> 06</span></footer>
  </>
}
