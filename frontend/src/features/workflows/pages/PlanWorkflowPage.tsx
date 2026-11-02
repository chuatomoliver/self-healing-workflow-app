import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { workflowRoutes } from '../../../app/navigation'
import { Button } from '../../../components/ui/Button'
import { Icon } from '../../../components/ui/Icon'
import { Dialog } from '../../../components/ui/Dialog'
import { WorkflowPageHeading, WorkflowPageFooter } from '../../../components/ui/WorkflowPageHeading'
import { PlanStepList } from '../components/PlanStepList'
import { PlanStepDetails } from '../components/PlanStepDetails'
import { PlanWebhooks } from '../components/PlanWebhooks'
import { WebhookTemplateDialog } from '../components/WebhookTemplateDialog'
import { StepSetupDialog } from '../components/StepSetupDialog'
import { PlanChecks } from '../components/PlanChecks'
import { setupInput } from '../components/SetupFields'
import { refreshPlanChecks, webhookSetupIssues, workflowSetupSummary } from '../../../../../shared/setup.ts'
import type { PlanStep, PlanWebhookTemplate, WorkflowPlan } from '../types'
import type { SavedWorkflow } from '../../../../../shared/workflows.ts'

type Props = { plan: WorkflowPlan; prompt: string; sourceFile: File | null; storage: ReactNode; onChangePlan: (plan: WorkflowPlan, message: string) => void; onContinue: () => void; planning: boolean; onGeneratePlan: () => void; onCancelPlanning: () => void; planError: string; saved: SavedWorkflow | null; canDeliver: boolean }
export function PlanWorkflowPage({ plan, prompt, sourceFile, storage, onChangePlan, onContinue, planning, onGeneratePlan, onCancelPlanning, planError, saved, canDeliver }: Props) {
  const [selectedId, setSelectedId] = useState(plan.steps[0]?.id ?? '')
  const [editingStep, setEditingStep] = useState<string | null>(null)
  const [editingWebhook, setEditingWebhook] = useState<string | null>(null)
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null)
  const [managingDraft, setManagingDraft] = useState(false)
  const detailsRef = useRef<HTMLElement>(null)
  const selected = plan.steps.find((step) => step.id === selectedId) ?? plan.steps[0]
  const summary = workflowSetupSummary(plan)
  const stepToEdit = plan.steps.find((step) => step.id === editingStep)
  const webhookToEdit = plan.webhooks.find((webhook) => webhook.id === editingWebhook)
  const questionToEdit = plan.questions.find((question) => question.id === editingQuestion)
  const branchCount = plan.steps.reduce((count, step) => {
    const paths = plan.edges.filter((edge) => edge.source === step.id)
    return count + (paths.length > 1 ? paths.length : 0)
  }, 0)
  function inspectStep(id: string) { setSelectedId(id); requestAnimationFrame(() => detailsRef.current?.focus()) }
  function applyStep(next: PlanStep) {
    const previous = plan.steps.find((step) => step.id === next.id)
    const mappingsChanged = JSON.stringify(previous?.mappings) !== JSON.stringify(next.mappings)
    onChangePlan({ ...plan, steps: plan.steps.map((step) => step.id === next.id ? next : step),
      webhooks: plan.webhooks.map((webhook) => webhook.id === next.webhookTemplateId && mappingsChanged && webhook.setup ? { ...webhook, configuredBy: undefined, setup: { ...webhook.setup, payloadReviewed: false } } : webhook),
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
          ...(updateMappings ? { mappings, inputs: next.direction === 'outgoing' ? fields : step.inputs, outputs: next.direction === 'incoming' ? fields : step.outputs } : {}),
          configuration: step.configuration.map((setting) => setting.label === 'Webhook setup' ? { ...setting, value: webhookSetupIssues(next).length ? 'Complete endpoint, authentication reference, and payload review.' : 'Webhook configuration reviewed. See delivery history for test results.', needsInput: webhookSetupIssues(next).length > 0 } : setting),
        }
      }),
    }, `Updated configuration for ${next.name}.`)
    setEditingWebhook(null)
  }
  return <>
    <WorkflowPageHeading step={3} stage="WORKFLOW PLANNING" title="Review the workflow plan." description="Muse prepares the setup from your prompt. Check the proposal and answer any missing details." />
    <section className="rounded-xl border border-line bg-surface p-5 xl:p-6" aria-labelledby="plan-summary-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl"><h2 id="plan-summary-heading" className="text-base font-semibold tracking-tight">{plan.title}</h2></div>
        <span className={`rounded-md px-2.5 py-1.5 text-[10px] font-medium ${summary.complete ? 'bg-accent-soft text-accent' : 'bg-amber-50 text-amber-800'}`}>{summary.complete ? plan.configurationMode === 'automatic' ? 'Setup ready' : 'Setup reviewed' : 'Needs information'}</span>
      </div>
      <p className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-muted"><Icon name="arrow" width="15" height="15" className="mt-0.5 shrink-0 text-accent" /><span><strong className="font-medium text-ink">Expected outcome: </strong>{plan.expectedOutcome}</span></p>
      <div className="mt-5 grid grid-cols-3 gap-2.5 border-t border-line pt-4">{[{ label: 'Proposed steps', value: plan.steps.length }, { label: 'Webhook templates', value: plan.webhooks.length }, { label: 'Branch paths', value: branchCount }].map((stat) => <div key={stat.label}><span className="text-lg font-semibold tracking-tight">{stat.value}</span><span className="mt-0.5 block text-[10px] leading-relaxed text-muted">{stat.label}</span></div>)}</div>
      {(sourceFile || prompt.trim()) && <details className="mt-4 border-t border-line pt-3"><summary className="cursor-pointer text-[11px] font-medium text-muted">Your original input</summary>{sourceFile && <p className="mt-3 flex items-center gap-2 text-[11px] text-muted"><Icon name="file" width="14" height="14" />{sourceFile.name}</p>}{prompt.trim() && <p className="mt-2 text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere text-muted">{prompt}</p>}</details>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3"><span className="text-[10px] text-muted">{saved ? `Version ${saved.version} · ${canDeliver ? 'Saved' : 'Unsaved changes'}` : 'Not saved yet'}</span><Button variant="text" size="inline" disabled={planning} onClick={() => setManagingDraft(true)}>Save & manage drafts<Icon name="arrow" width="12" height="12" /></Button></div>
    </section>
    <div className="mt-5 grid items-start gap-5 lg:grid-cols-[0.85fr_1.15fr]"><PlanStepList steps={plan.steps} selectedStepId={selected?.id ?? null} onSelectStep={setSelectedId} />
      {selected ? <PlanStepDetails step={selected} plan={plan} containerRef={detailsRef} webhookConnections={{}} onReviewWebhook={(webhook) => { if (!planning) setEditingWebhook(webhook.id) }} onEdit={() => setEditingStep(selected.id)} editingDisabled={planning} /> : <section className="rounded-xl border border-line bg-surface p-6 text-xs text-muted">Step configuration will appear here.</section>}
    </div>
    <PlanWebhooks templates={plan.webhooks} steps={plan.steps} saved={saved} canDeliver={canDeliver && !planning} onReview={(webhook) => { if (!planning) setEditingWebhook(webhook.id) }} />
    <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
      <section className="min-w-0 rounded-xl border border-line bg-surface p-5 xl:p-6" aria-labelledby="questions-heading">
        <div className="flex items-center justify-between gap-3"><h2 id="questions-heading" className="text-sm font-semibold">Decisions to resolve</h2><span className="rounded-md bg-amber-50 px-2 py-1 text-[10px] text-amber-800">{plan.questions.length - summary.answeredQuestions} open</span></div>
        <ul className="mt-5 grid gap-3">{plan.questions.map((question) => <li key={question.id} className="rounded-lg border border-amber-200/70 bg-amber-50/50 p-4"><h3 className="text-xs font-semibold text-amber-900">{question.question}</h3><p className="mt-2 text-[11px] leading-relaxed text-amber-800">{question.explanation}</p>{question.answer?.trim() && <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-[11px] text-ink">{question.answer}</p>}<div className="mt-3 flex flex-wrap gap-4"><Button variant="text" size="inline" onClick={() => inspectStep(question.stepId)}>Inspect related step<Icon name="arrow" width="12" height="12" /></Button><Button variant="text" size="inline" disabled={planning} onClick={() => setEditingQuestion(question.id)}>{question.answer?.trim() ? 'Edit answer' : 'Answer question'}</Button></div></li>)}</ul>
        {!plan.questions.length && <p className="mt-5 text-xs text-muted">No open questions are listed in this plan.</p>}
      </section><PlanChecks checks={refreshPlanChecks(plan).checks} />
    </div>
    <details className="mt-5 min-w-0 rounded-xl border border-line bg-surface p-5 xl:p-6"><summary className="cursor-pointer text-xs font-semibold">View structured plan JSON</summary><pre className="mt-4 max-h-80 overflow-auto rounded-lg bg-slate-950 p-4 text-[10px] leading-[1.8] text-slate-200"><code>{JSON.stringify(plan, null, 2)}</code></pre></details>
    <div className="mt-7 flex flex-wrap items-center justify-between gap-4"><Link to={workflowRoutes.parse} className="inline-flex items-center gap-2 rounded-md border border-line bg-surface px-4 py-3 text-xs font-semibold transition-colors duration-200 hover:bg-slate-50 motion-reduce:transition-none"><Icon name="back" width="16" height="16" />Back to diagram</Link>
      <div className="flex flex-col items-end gap-2"><div className="flex flex-wrap gap-3">{planning ? <Button variant="secondary" onClick={onCancelPlanning}>Cancel planning</Button> : <Button variant="secondary" onClick={onGeneratePlan}>{plan.generatedBy === 'muse' ? 'Update setup with Muse' : 'Generate plan with Muse'}</Button>}<Button onClick={onContinue}>Build on canvas<Icon name="arrow" width="17" height="17" /></Button></div><p className="text-[10px] text-muted">{planning ? 'Muse is preparing the plan…' : 'Update setup only when your answers or connections change. This uses Meta credits.'}</p></div>
    </div>
    {planError && <p role="alert" className="mt-4 text-xs text-danger">{planError}</p>}
    <WorkflowPageFooter step={3} label="PLAN WORKFLOW" />
    {managingDraft && <Dialog open title="Save & manage drafts" onClose={() => setManagingDraft(false)}>{storage}</Dialog>}
    {!planning && stepToEdit && <StepSetupDialog key={stepToEdit.id} step={stepToEdit} onApply={applyStep} onClose={() => setEditingStep(null)} />}
    {!planning && webhookToEdit && <WebhookTemplateDialog key={webhookToEdit.id} template={webhookToEdit} onUpdate={applyWebhook} onClose={() => setEditingWebhook(null)} />}
    {!planning && questionToEdit && <Dialog open title={questionToEdit.question} onClose={() => setEditingQuestion(null)}><p className="text-xs leading-relaxed text-muted">{questionToEdit.explanation}</p><label className="mt-4 block text-xs font-medium">Your answer<textarea className={setupInput} rows={4} maxLength={4000} value={questionToEdit.answer ?? ''} onChange={(event) => onChangePlan({ ...plan, questions: plan.questions.map((question) => question.id === questionToEdit.id ? { ...question, answer: event.target.value } : question), steps: plan.steps.map((step) => step.id === questionToEdit.stepId ? { ...step, reviewed: false, configuredBy: undefined } : step) }, '')} /></label><Button className="mt-4" onClick={() => setEditingQuestion(null)}>Done</Button></Dialog>}
  </>
}
