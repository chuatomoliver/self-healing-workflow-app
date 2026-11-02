import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { workflowRoutes } from '../../../app/navigation'
import { Button } from '../../../components/ui/Button'
import { WorkflowCanvas } from '../components/WorkflowCanvas'
import { CanvasStepInspector } from '../components/CanvasStepInspector'
import type { ParsedDiagram, WorkflowPlan } from '../../../../../shared/workflows'
import { workflowSetupSummary } from '../../../../../shared/setup'

export function RunCanvasPage({ plan, diagram, onRenameStep, onMoveSteps, onEditSetup }: {
  plan: WorkflowPlan; diagram: ParsedDiagram; onRenameStep: (id: string, title: string) => void
  onMoveSteps: (positions: Record<string, { x: number; y: number }>) => void; onEditSetup: () => void
}) {
  const [selectedId, setSelectedId] = useState(plan.steps[0]?.id ?? '')
  const originalPositions = useRef(Object.fromEntries(diagram.nodes.map((node) => [node.id, node.position])))
  const positions = Object.fromEntries(diagram.nodes.map((node) => [node.id, node.position]))
  const selected = plan.steps.find((step) => step.id === selectedId) ?? plan.steps[0]
  const summary = workflowSetupSummary(plan)
  return <>
    <header className="mt-8 mb-7"><p className="text-[10px] font-semibold tracking-wide text-accent">STEP 4 OF 6 · CANVAS</p><h1 className="mt-4 text-3xl font-semibold tracking-tight">Review your workflow on the canvas.</h1><p className="mt-3 text-xs leading-relaxed text-muted">Arrange the current steps and inspect their setup. Names and layout are included when you save the draft.</p></header>
    <section className="min-w-0 rounded-xl border border-line bg-surface p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold">{plan.title}</h2><p className="mt-2 text-[11px] text-muted">{plan.steps.length} steps · {plan.edges.length} connections · {summary.reviewedSteps} steps reviewed</p></div><span className="rounded-md bg-accent-soft px-2 py-1 text-[10px] text-accent">{summary.complete ? 'Setup reviewed' : 'Needs setup'}</span></div>
      <div className="mt-5 flex flex-wrap items-center gap-3"><Button disabled title="Live execution is not available yet">Run workflow</Button><Button variant="secondary" onClick={onEditSetup}>Edit setup and save</Button><Button variant="secondary" onClick={() => onMoveSteps(originalPositions.current)}>Reset layout</Button></div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted">Live execution is not available yet. You can arrange the workflow, review its setup, and save your changes.</p>
      <div className="mt-5"><WorkflowCanvas steps={plan.steps} paths={plan.edges} positions={positions} states={{}} webhookConnections={{}} selectedStepId={selected?.id ?? null} running={false} onSelect={setSelectedId} onMove={(id, position) => onMoveSteps({ [id]: position })} /></div>
    </section>
    <div className="mt-5 grid items-start gap-5 lg:grid-cols-[0.9fr_1.1fr]"><section className="min-w-0 rounded-xl border border-line bg-surface p-5"><h2 className="text-sm font-semibold">Step inspector</h2><label htmlFor="canvas-current-step" className="mt-3 block text-[11px] text-muted">Selected step</label><select id="canvas-current-step" value={selected?.id ?? ''} onChange={(event) => setSelectedId(event.target.value)} className="mt-2 w-full rounded-md border border-line bg-surface p-3 text-xs">{plan.steps.map((step) => <option key={step.id} value={step.id}>{step.title}</option>)}</select>
      {selected && <CanvasStepInspector key={`${selected.id}:${selected.title}`} step={selected} state="idle" connections={{}} running={false} webhook={plan.webhooks.find((webhook) => webhook.id === selected.webhookTemplateId)} onRename={onRenameStep} onReviewWebhook={onEditSetup} />}
    </section><section className="rounded-xl border border-line bg-surface p-5"><h2 className="text-sm font-semibold">Execution results</h2><p className="mt-3 text-xs leading-relaxed text-muted">This workflow has not run. Real step outputs and delivery results will appear here when execution is connected.</p><p className="mt-4 text-[11px] text-muted">Current setup: {summary.configuredWebhooks} of {plan.webhooks.length} webhooks configured; {plan.questions.length - summary.answeredQuestions} unanswered questions.</p><Link to={workflowRoutes.logs} className="mt-4 inline-block text-xs text-accent">View workflow activity</Link></section></div>
    <div className="my-7"><Link to={workflowRoutes.plan} className="text-xs text-accent">Back to workflow setup</Link></div>
  </>
}
