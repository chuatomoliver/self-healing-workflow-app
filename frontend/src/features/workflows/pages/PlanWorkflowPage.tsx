import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { workflowRoutes } from '../../../app/navigation'
import { Button } from '../../../components/ui/Button'
import { PlanStepList } from '../components/PlanStepList'
import { PlanStepDetails } from '../components/PlanStepDetails'
import { PlanWebhooks } from '../components/PlanWebhooks'
import { WebhookTemplateDialog } from '../components/WebhookTemplateDialog'
import { StepSetupDialog } from '../components/StepSetupDialog'
import { PlanChecks } from '../components/PlanChecks'
import { setupInput } from '../components/SetupFields'
import { refreshPlanChecks, webhookSetupIssues, workflowSetupSummary } from '../../../../../shared/setup.ts'
import type { PlanStep, PlanWebhookTemplate, WorkflowPlan } from '../types'

type Props = { plan: WorkflowPlan; prompt: string; sourceFile: File | null; storage: ReactNode; onChangePlan: (plan: WorkflowPlan, message: string) => void; onContinue: () => void; planning: boolean; onGeneratePlan: () => void; onCancelPlanning: () => void; planError: string }
export function PlanWorkflowPage({ plan, prompt, sourceFile, storage, onChangePlan, onContinue, planning, onGeneratePlan, onCancelPlanning, planError }: Props) {
  const [selectedId, setSelectedId] = useState(plan.steps[0]?.id ?? '')
  const [editingStep, setEditingStep] = useState<string | null>(null)
  const [editingWebhook, setEditingWebhook] = useState<string | null>(null)
  const detailsRef = useRef<HTMLElement>(null)
  const selected = plan.steps.find((step) => step.id === selectedId) ?? plan.steps[0]
  const summary = workflowSetupSummary(plan)
  const stepToEdit = plan.steps.find((step) => step.id === editingStep)
  const webhookToEdit = plan.webhooks.find((webhook) => webhook.id === editingWebhook)
  function applyStep(next: PlanStep) {
    const previous = plan.steps.find((step) => step.id === next.id)
    const mappingsChanged = JSON.stringify(previous?.mappings) !== JSON.stringify(next.mappings)
    onChangePlan({ ...plan, steps: plan.steps.map((step) => step.id === next.id ? next : step),
      webhooks: plan.webhooks.map((webhook) => webhook.id === next.webhookTemplateId && mappingsChanged && webhook.setup ? { ...webhook, setup: { ...webhook.setup, payloadReviewed: false } } : webhook),
    }, `Updated setup for ${next.title}.`)
    setEditingStep(null)
  }
  function applyWebhook(next: PlanWebhookTemplate) {
    const previous = plan.webhooks.find((webhook) => webhook.id === next.id)
    const payloadChanged = JSON.stringify(previous?.payloadTemplate) !== JSON.stringify(next.payloadTemplate)
    const settingsChanged = payloadChanged || JSON.stringify(previous?.authentication) !== JSON.stringify(next.authentication) || previous?.endpoint.urlTemplate !== next.endpoint.urlTemplate
    onChangePlan({ ...plan, webhooks: plan.webhooks.map((webhook) => webhook.id === next.id ? next : webhook),
      steps: plan.steps.map((step) => {
        if (step.webhookTemplateId !== next.id) return step
        const fields = Object.keys(next.payloadTemplate).map((name) => ({ name, description: step.inputs.concat(step.outputs).find((field) => field.name === name)?.description ?? 'User-configured webhook field.' }))
        const webhookMappings = Object.entries(next.payloadTemplate).map(([name, reference]) => next.direction === 'incoming'
            ? { source: `webhook.payload.${name}`, target: reference.slice(2, -2) }
            : { source: reference.slice(2, -2), target: `webhook.payload.${name}` })
        const mappings = [...step.mappings.filter((mapping) => next.direction === 'incoming' ? !mapping.source.startsWith('webhook.payload.') : !mapping.target.startsWith('webhook.payload.')), ...webhookMappings]
        const updateMappings = payloadChanged || next.setup?.payloadReviewed
        return { ...step, reviewed: settingsChanged || (updateMappings && JSON.stringify(mappings) !== JSON.stringify(step.mappings)) ? false : step.reviewed,
          ...(updateMappings ? { mappings,
            inputs: next.direction === 'outgoing' ? fields : step.inputs, outputs: next.direction === 'incoming' ? fields : step.outputs } : {}),
          configuration: step.configuration.map((setting) => setting.label === 'Webhook setup' ? { ...setting, value: webhookSetupIssues(next).length ? 'Complete endpoint, authentication reference, and payload review.' : 'Webhook configuration reviewed; connection not tested.', needsInput: webhookSetupIssues(next).length > 0 } : setting),
        }
      }),
    }, `Updated configuration for ${next.name}.`)
    setEditingWebhook(null)
  }
  return <>
    <header className="mt-8 mb-7"><p className="text-[10px] font-semibold tracking-wide text-accent">STEP 3 OF 6 · WORKFLOW PLANNING</p><h1 className="mt-4 text-3xl font-semibold tracking-tight">Set up your workflow.</h1><p className="mt-3 text-xs leading-relaxed text-muted">Review the operations, resolve missing information, and configure the suggested connections.</p></header>
    {storage}
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold">{plan.title}</h2><p className="mt-2 max-w-2xl text-xs leading-relaxed text-muted">{plan.summary}</p></div><span className="rounded-md bg-accent-soft px-2 py-1 text-[10px] text-accent">{summary.complete ? 'Setup reviewed · not tested' : 'Setup in progress'}</span></div>
      <p className="mt-4 text-xs leading-relaxed"><strong className="font-medium">Expected outcome: </strong>{plan.expectedOutcome}</p>
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">{[{ name: 'Steps reviewed', value: `${summary.reviewedSteps}/${plan.steps.length}` }, { name: 'Webhooks configured', value: `${summary.configuredWebhooks}/${plan.webhooks.length}` }, { name: 'Questions answered', value: `${summary.answeredQuestions}/${plan.questions.length}` }].map((item) => <div key={item.name}><p className="text-lg font-semibold">{item.value}</p><p className="mt-1 text-[10px] text-muted">{item.name}</p></div>)}</div>
      {(prompt || sourceFile) && <details className="mt-4 border-t border-line pt-3"><summary className="cursor-pointer text-[11px] font-medium">Original input</summary>{sourceFile && <p className="mt-2 text-[11px] text-muted">{sourceFile.name}</p>}<p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted">{prompt}</p></details>}
    </section>
    <section className="mt-5 rounded-xl border border-line bg-surface p-5" aria-busy={planning}>
      <h2 className="text-sm font-semibold">{plan.generatedBy === 'muse' ? 'Plan generated by Muse' : 'Detailed planning'}</h2><p className="mt-2 text-[11px] leading-relaxed text-muted">Ask Muse to propose operations, inputs, outputs, and mappings for this graph. Missing business rules remain questions. Steps you have reviewed keep their setup.</p>
      <p className="mt-2 text-[10px] text-muted">This is a separate AI request and may use credits. Nothing is sent until you select the button.</p>
      {planning ? <div className="mt-3 flex items-center gap-3"><p role="status" className="text-xs text-accent">Muse is preparing the plan…</p><Button variant="secondary" size="compact" onClick={onCancelPlanning}>Cancel planning</Button></div> : <Button className="mt-4" onClick={onGeneratePlan}>{plan.generatedBy === 'muse' ? 'Update unreviewed steps with Muse' : 'Generate detailed plan with Muse'}</Button>}
      {planError && <p role="alert" className="mt-3 text-xs text-danger">{planError}</p>}
    </section>
    <div className="mt-5 grid items-start gap-5 lg:grid-cols-[0.85fr_1.15fr]"><PlanStepList steps={plan.steps} selectedStepId={selected?.id ?? null} onSelectStep={setSelectedId} /><div>{selected && <><PlanStepDetails step={selected} plan={plan} containerRef={detailsRef} webhookConnections={{}} onReviewWebhook={(webhook) => setEditingWebhook(webhook.id)} /><Button variant="secondary" className="mt-3" disabled={planning} onClick={() => setEditingStep(selected.id)}>Edit {selected.title} setup</Button><p className="mt-2 text-[10px] text-muted">{selected.reviewed ? 'Step setup reviewed. No execution has run.' : 'Step setup needs review.'}</p></>}</div></div>
    <PlanWebhooks templates={plan.webhooks} steps={plan.steps} onReview={(webhook) => { if (!planning) setEditingWebhook(webhook.id) }} />
    <div className="mt-5 grid items-start gap-5 lg:grid-cols-2"><section className="rounded-xl border border-line bg-surface p-5"><h2 className="text-sm font-semibold">Decisions to resolve</h2><p className="mt-2 text-[10px] text-muted">{plan.questions.length - summary.answeredQuestions} unanswered</p>
      {plan.questions.map((question) => <label key={question.id} className="mt-4 block rounded-lg border border-line p-3"><span className="text-xs font-medium">{question.question}</span><span className="mt-1 block text-[10px] leading-relaxed text-muted">{question.explanation}</span><textarea className={setupInput} disabled={planning} rows={3} maxLength={4000} value={question.answer ?? ''} placeholder="Your answer" onChange={(event) => onChangePlan({ ...plan, questions: plan.questions.map((item) => item.id === question.id ? { ...item, answer: event.target.value } : item), steps: plan.steps.map((step) => step.id === question.stepId ? { ...step, reviewed: false } : step) }, '')} /></label>)}
      {!plan.questions.length && <p className="mt-4 text-xs text-muted">No open questions were returned for this workflow.</p>}</section><PlanChecks checks={refreshPlanChecks(plan).checks} /></div>
    <details className="mt-5 rounded-xl border border-line bg-surface p-5"><summary className="cursor-pointer text-xs font-semibold">View current workflow data</summary><pre className="mt-4 max-h-80 overflow-auto rounded-lg bg-slate-950 p-4 text-[10px] leading-relaxed text-slate-200">{JSON.stringify(plan, null, 2)}</pre></details>
    <div className="my-7 flex flex-wrap justify-between gap-3"><Link to={workflowRoutes.parse} className="text-xs text-accent">Back to diagram</Link><Button onClick={onContinue}>Open canvas</Button></div>
    {!planning && stepToEdit && <StepSetupDialog key={stepToEdit.id} step={stepToEdit} onApply={applyStep} onClose={() => setEditingStep(null)} />}
    {!planning && webhookToEdit && <WebhookTemplateDialog key={webhookToEdit.id} template={webhookToEdit} onUpdate={applyWebhook} onClose={() => setEditingWebhook(null)} />}
  </>
}
