import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '../../../components/ui/Button'
import { Icon } from '../../../components/ui/Icon'
import { Dialog } from '../../../components/ui/Dialog'
import { WorkflowPageHeading, WorkflowPageFooter } from '../../../components/ui/WorkflowPageHeading'
import { PlanStepList } from '../components/PlanStepList'
import { PlanStepDetails } from '../components/PlanStepDetails'
import { PlanWebhooks } from '../components/PlanWebhooks'
import { WebhookTemplateDialog } from '../components/WebhookTemplateDialog'
import { StepSetupDialog } from '../components/StepSetupDialog'
import { SlackSetupDialog } from '../components/SlackSetupDialog'
import { slackWorkflowSteps } from '../slackSetup'
import { SlackMessagePlan } from '../components/SlackMessagePlan'
import { PlanDraftActions } from '../components/PlanDraftActions'
import { PlanChecks } from '../components/PlanChecks'
import { setupInput } from '../components/SetupFields'
import { refreshPlanChecks, webhookSetupIssues, workflowSetupSummary } from '../../../../../shared/setup.ts'
import type { PlanStep, PlanWebhookTemplate, WorkflowPlan } from '../types'
import type { SavedWorkflow } from '../../../../../shared/workflows.ts'
import { isConnectionSetupQuestion } from '../../../../../shared/webhookSuggestions.ts'

export type PlanWorkflowPageProps = { plan: WorkflowPlan; prompt: string; sourceFile: File | null; storage: ReactNode; onChangePlan: (plan: WorkflowPlan, message: string) => void; onContinue: () => void; planning: boolean; onGeneratePlan: () => void; onCancelPlanning: () => void; planError: string; saved: SavedWorkflow | null; canDeliver: boolean }
export function PlanWorkflowPage(props: PlanWorkflowPageProps) {
  const [details, setDetails] = useState(false)
  if (slackWorkflowSteps(props.plan) && !details) return <SlackMessagePlan {...props} onDetails={() => setDetails(true)} />
  return <>{slackWorkflowSteps(props.plan) && <Button variant="text" className="mb-5" disabled={props.planning} onClick={() => setDetails(false)}>Back to message</Button>}<DetailedPlanWorkflowPage {...props} /></>
}

function DetailedPlanWorkflowPage({ plan, prompt, sourceFile, storage, onChangePlan, onContinue, planning, onGeneratePlan, onCancelPlanning, planError, saved, canDeliver }: PlanWorkflowPageProps) {
  const [selectedId, setSelectedId] = useState(plan.steps[0]?.id ?? '')
  const [editingStep, setEditingStep] = useState<string | null>(null)
  const [editingWebhook, setEditingWebhook] = useState<string | null>(null)
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null)
  const [managingDraft, setManagingDraft] = useState(false)
  const [settingUpSlack, setSettingUpSlack] = useState(false)
  const detailsRef = useRef<HTMLElement>(null)
  const selected = plan.steps.find((step) => step.id === selectedId) ?? plan.steps[0]
  const summary = workflowSetupSummary(plan)
  const businessQuestions = plan.questions.filter((question) => !isConnectionSetupQuestion(question))
  const openQuestions = businessQuestions.filter((question) => !question.answer?.trim()).length
  const identifiedConnections = plan.webhooks.length > summary.configuredWebhooks && summary.configuredSteps === plan.steps.length && !openQuestions
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
    <WorkflowPageHeading step={3} stage="WORKFLOW PLANNING" title="Review the workflow plan." description="Muse identifies the steps and necessary webhooks from your prompt. Review the suggestions and any missing business decisions." />
    <section className="rounded-xl border border-line bg-surface p-5 xl:p-6" aria-labelledby="plan-summary-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl"><h2 id="plan-summary-heading" className="text-base font-semibold tracking-tight">{plan.title}</h2></div>
        <span className={`rounded-md px-2.5 py-1.5 text-[10px] font-medium ${summary.complete || identifiedConnections ? 'bg-accent-soft text-accent' : 'bg-amber-50 text-amber-800'}`}>{summary.complete ? plan.configurationMode === 'automatic' ? 'Setup ready' : 'Setup reviewed' : identifiedConnections ? 'Webhooks identified' : 'Needs information'}</span>
      </div>
      <p className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-muted"><Icon name="arrow" width="15" height="15" className="mt-0.5 shrink-0 text-accent" /><span><strong className="font-medium text-ink">Expected outcome: </strong>{plan.expectedOutcome}</span></p>
      <div className="mt-5 grid grid-cols-3 gap-2.5 border-t border-line pt-4">{[{ label: 'Proposed steps', value: plan.steps.length }, { label: 'Necessary webhooks', value: plan.webhooks.length }, { label: 'Branch paths', value: branchCount }].map((stat) => <div key={stat.label}><span className="text-lg font-semibold tracking-tight">{stat.value}</span><span className="mt-0.5 block text-[10px] leading-relaxed text-muted">{stat.label}</span></div>)}</div>
      {(sourceFile || prompt.trim()) && <details className="mt-4 border-t border-line pt-3"><summary className="cursor-pointer text-[11px] font-medium text-muted">Your original input</summary>{sourceFile && <p className="mt-3 flex items-center gap-2 text-[11px] text-muted"><Icon name="file" width="14" height="14" />{sourceFile.name}</p>}{prompt.trim() && <p className="mt-2 text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere text-muted">{prompt}</p>}</details>}
      {slackWorkflowSteps(plan) && <div className="mt-4 rounded-lg border border-line bg-slate-50 p-4"><h3 className="text-xs font-semibold">Slack connection</h3><p className="mt-2 text-[11px] leading-relaxed text-muted">Choose a saved Slack webhook or add one, and set your message in one place.</p><Button className="mt-3" variant="secondary" size="compact" disabled={planning} onClick={() => setSettingUpSlack(true)}>Set up Slack</Button></div>}
    </section>
    <PlanWebhooks templates={plan.webhooks} steps={plan.steps} saved={saved} canDeliver={canDeliver && !planning} onReview={(webhook) => { if (!planning) setEditingWebhook(webhook.id) }} />
    <div className="mt-5 grid items-start gap-5 lg:grid-cols-[0.85fr_1.15fr]"><PlanStepList steps={plan.steps} selectedStepId={selected?.id ?? null} onSelectStep={setSelectedId} />
      {selected ? <PlanStepDetails step={selected} plan={plan} containerRef={detailsRef} webhookConnections={{}} onReviewWebhook={(webhook) => { if (!planning) setEditingWebhook(webhook.id) }} onEdit={() => setEditingStep(selected.id)} editingDisabled={planning} /> : <section className="rounded-xl border border-line bg-surface p-6 text-xs text-muted">Step configuration will appear here.</section>}
    </div>
    <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
      <section className="min-w-0 rounded-xl border border-line bg-surface p-5 xl:p-6" aria-labelledby="questions-heading">
        <div className="flex items-center justify-between gap-3"><h2 id="questions-heading" className="text-sm font-semibold">Decisions to resolve</h2><span className="rounded-md bg-amber-50 px-2 py-1 text-[10px] text-amber-800">{openQuestions} open</span></div>
        <ul className="mt-5 grid gap-3">{businessQuestions.map((question) => <li key={question.id} className="rounded-lg border border-amber-200/70 bg-amber-50/50 p-4"><h3 className="text-xs font-semibold text-amber-900">{question.question}</h3><p className="mt-2 text-[11px] leading-relaxed text-amber-800">{question.explanation}</p>{question.answer?.trim() && <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-[11px] text-ink">{question.answer}</p>}<div className="mt-3 flex flex-wrap gap-4"><Button variant="text" size="inline" onClick={() => inspectStep(question.stepId)}>Inspect related step<Icon name="arrow" width="12" height="12" /></Button><Button variant="text" size="inline" disabled={planning} onClick={() => setEditingQuestion(question.id)}>{question.answer?.trim() ? 'Edit answer' : 'Answer question'}</Button></div></li>)}</ul>
        {!businessQuestions.length && <p className="mt-5 text-xs text-muted">No business decisions are missing. Necessary webhooks are listed above.</p>}
      </section><PlanChecks checks={refreshPlanChecks(plan).checks} />
    </div>
    <details className="mt-5 min-w-0 rounded-xl border border-line bg-surface p-5 xl:p-6"><summary className="cursor-pointer text-xs font-semibold">View structured plan JSON</summary><pre className="mt-4 max-h-80 overflow-auto rounded-lg bg-slate-950 p-4 text-[10px] leading-[1.8] text-slate-200"><code>{JSON.stringify(plan, null, 2)}</code></pre></details>
    <PlanDraftActions saved={saved} currentSaved={canDeliver} disabled={planning} onManage={() => setManagingDraft(true)} onContinue={onContinue}>
      {planning ? <Button variant="secondary" onClick={onCancelPlanning}>Cancel planning</Button> : <Button variant="secondary" onClick={onGeneratePlan}>{plan.generatedBy === 'muse' ? 'Update setup with Muse' : 'Generate plan with Muse'}</Button>}
    </PlanDraftActions>
    <p className="mt-2 text-[10px] text-muted sm:text-right">{planning ? 'Muse is preparing the plan…' : 'Updating setup with Muse uses Meta credits.'}</p>
    {planError && <p role="alert" className="mt-4 text-xs text-danger">{planError}</p>}
    <WorkflowPageFooter step={3} label="PLAN WORKFLOW" />
    {managingDraft && <Dialog open title="Save & manage drafts" onClose={() => setManagingDraft(false)}>{storage}</Dialog>}
    {!planning && settingUpSlack && <SlackSetupDialog plan={plan} onClose={() => setSettingUpSlack(false)} onApply={(next) => { onChangePlan(next, 'Configured Slack delivery. Save the draft before running.'); setSettingUpSlack(false) }} />}
    {!planning && stepToEdit && <StepSetupDialog key={stepToEdit.id} step={stepToEdit} onApply={applyStep} onClose={() => setEditingStep(null)} />}
    {!planning && webhookToEdit && <WebhookTemplateDialog key={webhookToEdit.id} template={webhookToEdit} onUpdate={applyWebhook} onClose={() => setEditingWebhook(null)} />}
    {!planning && questionToEdit && <Dialog open title={questionToEdit.question} onClose={() => setEditingQuestion(null)}><p className="text-xs leading-relaxed text-muted">{questionToEdit.explanation}</p><label className="mt-4 block text-xs font-medium">Your answer<textarea className={setupInput} rows={4} maxLength={4000} value={questionToEdit.answer ?? ''} onChange={(event) => onChangePlan({ ...plan, questions: plan.questions.map((question) => question.id === questionToEdit.id ? { ...question, answer: event.target.value } : question), steps: plan.steps.map((step) => step.id === questionToEdit.stepId ? { ...step, reviewed: false, configuredBy: undefined } : step) }, '')} /></label><Button className="mt-4" onClick={() => setEditingQuestion(null)}>Done</Button></Dialog>}
  </>
}
