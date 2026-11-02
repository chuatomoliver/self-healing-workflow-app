import { Link } from 'react-router'
import { workflowRoutes } from '../../../app/navigation'
import type { WorkflowPlan } from '../../../../../shared/workflows'
import { workflowSetupSummary } from '../../../../../shared/setup'

export function SelfHealPage({ plan }: { plan: WorkflowPlan | null }) {
  const summary = plan ? workflowSetupSummary(plan) : null
  return <>
    <header className="mt-8 mb-7"><p className="text-[10px] font-semibold tracking-wide text-accent">STEP 5 OF 6 · WORKFLOW REPAIR</p><h1 className="mt-4 text-3xl font-semibold tracking-tight">Repair review.</h1><p className="mt-3 text-xs leading-relaxed text-muted">Repair proposals need an actual failed run and its error details.</p></header>
    <section className="rounded-xl border border-line bg-surface p-6"><h2 className="text-base font-semibold">{plan ? `No failed run recorded for ${plan.title}` : 'No workflow selected'}</h2><p className="mt-3 max-w-2xl text-xs leading-relaxed text-muted">{plan ? 'This workflow has not been executed. There is no failure context to send to Muse, so no repair has been generated or applied.' : 'Create or open a workflow before reviewing its setup and any future execution failures.'}</p>
      {plan && summary && <p className="mt-4 text-[11px] leading-relaxed text-muted">{summary.reviewedSteps} of {plan.steps.length} steps reviewed · {summary.configuredWebhooks} of {plan.webhooks.length} webhooks configured.</p>}
      <p className="mt-4 text-[11px] leading-relaxed text-muted">When execution and repair services are connected, this page will show the failed step, the proposed change, and your review decision.</p>
      <Link to={plan ? workflowRoutes.plan : workflowRoutes.describe} className="mt-5 inline-block rounded-md bg-accent px-4 py-2.5 text-xs font-semibold text-white">{plan ? 'Review workflow setup' : 'Describe a workflow'}</Link>
    </section>
  </>
}
