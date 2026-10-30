import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { workflowRoutes } from '../../../app/navigation'
import { Button } from '../../../components/ui/Button'
import { Icon } from '../../../components/ui/Icon'
import { PlanStepList } from '../components/PlanStepList'
import { PlanStepDetails } from '../components/PlanStepDetails'
import { PlanWebhooks } from '../components/PlanWebhooks'
import { WebhookTemplateDialog } from '../components/WebhookTemplateDialog'
import { PlanChecks } from '../components/PlanChecks'
import type { PlanWebhookTemplate, WebhookConnectionState, WorkflowPlan } from '../types'

type PlanWorkflowPageProps = {
  plan: WorkflowPlan
  prompt: string
  sourceFile: File | null
  webhookConnections: WebhookConnectionState
  onConnectWebhook: (templateId: string) => void
  onContinue: () => void
}

export function PlanWorkflowPage({ plan, prompt, sourceFile, webhookConnections, onConnectWebhook, onContinue }: PlanWorkflowPageProps) {
  const [selectedStepId, setSelectedStepId] = useState<string | null>(plan.steps[0]?.id ?? null)
  const [reviewWebhook, setReviewWebhook] = useState<PlanWebhookTemplate | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const detailsRef = useRef<HTMLElement>(null)
  const selectedStep = plan.steps.find((step) => step.id === selectedStepId) ?? plan.steps[0]
  const branchCount = plan.steps.reduce((count, step) => {
    const paths = plan.edges.filter((edge) => edge.source === step.id)
    return count + (paths.length > 1 ? paths.length : 0)
  }, 0)

  function inspectStep(id: string) {
    setSelectedStepId(id)
    requestAnimationFrame(() => detailsRef.current?.focus())
  }

  function connectWebhook(templateId: string) {
    const template = plan.webhooks.find((item) => item.id === templateId)
    if (!template || webhookConnections[templateId] === 'connected-demo') return
    onConnectWebhook(templateId)
    setAnnouncement(`${template.name} connected.`)
  }

  return (
    <>
      <div className="text-[9px] font-semibold tracking-[1.5px] text-muted">WORKFLOW BUILDER</div>
      <header className="mt-8 mb-7 md:mt-10 md:mb-8">
        <p className="mb-4 flex items-center gap-2 text-[10px] font-bold tracking-[1.4px] text-accent">
          <span className="size-1.5 rounded-full bg-accent" /> STEP 3 OF 6 · WORKFLOW PLANNING
        </p>
        <h1 className="mb-4 text-[clamp(1.875rem,3vw,2.625rem)] leading-tight font-[650] tracking-[-1.3px]">Review the workflow plan.</h1>
        <p className="max-w-2xl text-xs leading-[1.8] text-muted md:text-[13px]">
          Review steps and connect webhook templates before opening the canvas.
        </p>
      </header>

      <section className="rounded-xl border border-line bg-surface p-5 xl:p-6" aria-labelledby="plan-summary-heading">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 id="plan-summary-heading" className="text-base font-semibold tracking-tight">{plan.title}</h2>
            </div>
          </div>
          <span className="rounded-md bg-amber-50 px-2.5 py-1.5 text-[10px] font-medium text-amber-800">Needs configuration</span>
        </div>
        <p className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-muted">
          <Icon name="arrow" width="15" height="15" className="mt-0.5 shrink-0 text-accent" />
          <span><strong className="font-medium text-ink">Expected outcome: </strong>{plan.expectedOutcome}</span>
        </p>
        <div className="mt-5 grid grid-cols-3 gap-2.5 border-t border-line pt-4">
          {[{ label: 'Proposed steps', value: plan.steps.length }, { label: 'Webhook templates', value: plan.webhooks.length }, { label: 'Branch paths', value: branchCount }].map((stat) => <div key={stat.label}>
            <span className="text-lg font-semibold tracking-tight">{stat.value}</span>
            <span className="mt-0.5 block text-[10px] leading-relaxed text-muted">{stat.label}</span>
          </div>)}
        </div>
        {(sourceFile || prompt.trim()) && <details className="mt-4 border-t border-line pt-3">
          <summary className="cursor-pointer text-[11px] font-medium text-muted">Your original input</summary>
          {sourceFile && <p className="mt-3 flex items-center gap-2 text-[11px] text-muted"><Icon name="file" width="14" height="14" /><span className="wrap-anywhere">{sourceFile.name}</span></p>}
          {prompt.trim() && <p className="mt-2 text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere text-muted">{prompt}</p>}
        </details>}
      </section>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <PlanStepList steps={plan.steps} selectedStepId={selectedStep?.id ?? null} onSelectStep={setSelectedStepId} />
        {selectedStep
          ? <PlanStepDetails step={selectedStep} plan={plan} containerRef={detailsRef} webhookConnections={webhookConnections} onReviewWebhook={setReviewWebhook} />
          : <section className="rounded-xl border border-line bg-surface p-6 text-xs text-muted">Step configuration will appear here.</section>}
      </div>

      <PlanWebhooks templates={plan.webhooks} steps={plan.steps} connections={webhookConnections} onConnect={connectWebhook} onReview={setReviewWebhook} />
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
        <section className="min-w-0 rounded-xl border border-line bg-surface p-5 xl:p-6" aria-labelledby="questions-heading">
          <div className="flex items-center justify-between gap-3">
            <h2 id="questions-heading" className="text-sm font-semibold">Decisions to resolve</h2>
            <span className="rounded-md bg-amber-50 px-2 py-1 text-[10px] text-amber-800">{plan.questions.length} open</span>
          </div>
          <ul className="mt-5 grid gap-3">
            {plan.questions.map((question) => <li key={question.id} className="rounded-lg border border-amber-200/70 bg-amber-50/50 p-4">
              <h3 className="text-xs font-semibold text-amber-900">{question.question}</h3>
              <p className="mt-2 text-[11px] leading-relaxed text-amber-800">{question.explanation}</p>
              <Button variant="text" size="inline" className="mt-3" onClick={() => inspectStep(question.stepId)}>Inspect related step<Icon name="arrow" width="12" height="12" /></Button>
            </li>)}
          </ul>
          {plan.questions.length === 0 && <p className="mt-5 text-xs text-muted">No open questions are listed in this plan.</p>}
        </section>
        <PlanChecks checks={plan.checks} />
      </div>

      <details className="mt-5 min-w-0 rounded-xl border border-line bg-surface p-5 xl:p-6">
        <summary className="cursor-pointer text-xs font-semibold">View structured plan JSON</summary>
        <pre className="mt-4 max-h-80 overflow-auto rounded-lg bg-slate-950 p-4 text-[10px] leading-[1.8] text-slate-200"><code>{JSON.stringify(plan, null, 2)}</code></pre>
      </details>

      <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
        <Link to={workflowRoutes.parse}
          className="inline-flex items-center gap-2 rounded-md border border-line bg-surface px-4 py-3 text-xs font-semibold transition-colors duration-200 hover:bg-slate-50 motion-reduce:transition-none">
          <Icon name="back" width="16" height="16" />Back to diagram
        </Link>
        <div className="flex flex-col items-end gap-2">
          <Button onClick={onContinue}>Build on canvas<Icon name="arrow" width="17" height="17" /></Button>
        </div>
      </div>

      <footer className="mt-8 flex items-center justify-between border-t border-line pt-5 text-[8px] tracking-[1.5px] text-muted md:mt-10">
        <span>PLAN WORKFLOW</span>
        <span className="font-semibold tracking-wide text-accent">03 <span className="mx-2 text-slate-400">/</span> 06</span>
      </footer>

      <WebhookTemplateDialog template={reviewWebhook} connections={webhookConnections} onConnect={connectWebhook} onClose={() => setReviewWebhook(null)} />
    </>
  )
}
