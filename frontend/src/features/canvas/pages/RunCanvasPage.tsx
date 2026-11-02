import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { workflowRoutes } from '../../../app/navigation'
import { Button } from '../../../components/ui/Button'
import { Dialog } from '../../../components/ui/Dialog'
import { Icon } from '../../../components/ui/Icon'
import { WorkflowPageHeading, WorkflowPageFooter } from '../../../components/ui/WorkflowPageHeading'
import { WorkflowCanvas } from '../components/WorkflowCanvas'
import { CanvasStepInspector } from '../components/CanvasStepInspector'
import type { CanvasStepStatus } from '../types'
import type { ParsedDiagram, SavedWorkflow, WorkflowPlan } from '../../../../../shared/workflows'
import type { RunData } from '../../../../../shared/execution'
import { workflowSetupSummary } from '../../../../../shared/setup'
import type { WorkflowRunsState } from '../../execution/useWorkflowRuns'
import { ExecutionEvents, ExecutionStatus, RunPicker } from '../../execution/components'

export function RunCanvasPage({ plan, diagram, saved, canRun, execution, onRenameStep, onMoveSteps, onEditSetup }: {
  plan: WorkflowPlan; diagram: ParsedDiagram; saved: SavedWorkflow | null; canRun: boolean; execution: WorkflowRunsState
  onRenameStep: (id: string, title: string) => void; onMoveSteps: (positions: Record<string, { x: number; y: number }>) => void; onEditSetup: () => void
}) {
  const [selectedId, setSelectedId] = useState(plan.steps[0]?.id ?? '')
  const [inputOpen, setInputOpen] = useState(false)
  const [input, setInput] = useState('{}')
  const [inputError, setInputError] = useState('')
  const [autoRepair, setAutoRepair] = useState(true)
  const originalPositions = useRef(Object.fromEntries(diagram.nodes.map((node) => [node.id, node.position])))
  const run = execution.run
  const historical = !!run && run.workflowVersion !== saved?.version
  const viewPlan = historical ? run.snapshot.plan : plan
  const viewDiagram = historical ? run.snapshot.diagram : diagram
  const locked = execution.active || historical
  const positions = Object.fromEntries(viewDiagram.nodes.map((node) => [node.id, node.position]))
  const selected = viewPlan.steps.find((step) => step.id === selectedId) ?? viewPlan.steps[0]
  const summary = workflowSetupSummary(plan)
  const states: Record<string, CanvasStepStatus> = Object.fromEntries((run?.steps ?? []).map((step) => [step.stepId, step.status === 'pending' ? run?.status === 'cancelled' ? 'stopped' : 'idle' : step.status === 'unknown' ? 'failed' : step.status]))
  const selectedAttempt = run?.steps.find((step) => step.stepId === selected?.id)?.attempts.at(-1)
  const working = !!run && ['queued', 'preparing', 'running'].includes(run.status)
  return <>
    <WorkflowPageHeading step={4} stage="CANVAS & EXECUTION" title="Run it on the canvas." description="Arrange steps and inspect execution results." />
    <section className="min-w-0 rounded-xl border border-line bg-surface p-4 sm:p-5 xl:p-6" aria-labelledby="canvas-heading">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="canvas-heading" className="text-sm font-semibold">{viewPlan.title}</h2><p className="mt-2 text-[10px] leading-relaxed text-muted">{viewPlan.steps.length} steps · {viewPlan.edges.length} paths · {summary.configuredWebhooks}/{plan.webhooks.length} webhooks configured{run ? ' · run uses v' + run.workflowVersion : ''}</p></div><ExecutionStatus status={run?.status} repaired={!!run?.repairs.some((repair) => repair.status === 'applied')} /></div>
      <div className="mt-5 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-slate-50/70 p-3.5">
        <div className="min-w-0 flex-1 basis-56"><RunPicker execution={execution} /></div>
        <div className="flex flex-wrap gap-2">{working ? <Button variant="secondary" disabled={execution.busy || run.cancelRequested} onClick={() => { void execution.cancel() }}>{run.cancelRequested ? 'Stopping…' : 'Stop after current step'}</Button> : <Button disabled={!canRun || !summary.complete || execution.busy || execution.active} onClick={() => { setInput(JSON.stringify(run?.input ?? {}, null, 2)); setInputError(''); setInputOpen(true) }}><Icon name="play" width="15" height="15" />Run workflow</Button>}<Button variant="secondary" disabled={locked} onClick={() => onMoveSteps(originalPositions.current)}><Icon name="reset" width="14" height="14" />Reset layout</Button></div>
      </div>
      {(!canRun || !summary.complete) && <p className="mt-3 text-[11px] text-amber-800">Complete the setup and save your draft in Plan Workflow before starting a run.</p>}
      {historical && <p className="mt-3 text-[11px] text-muted">Viewing the saved version used by this run. Start a new run to use the current saved draft.</p>}
      {execution.error && <p role="alert" className="mt-3 text-xs text-danger">{execution.error}</p>}
      {run?.failure && <p role="alert" className="mt-3 text-xs text-danger">{run.failure.message} <Link to={workflowRoutes.heal} className="font-semibold underline">Review failure</Link></p>}
      <div className="mt-4"><WorkflowCanvas steps={viewPlan.steps} paths={viewPlan.edges} positions={positions} states={states} webhookConnections={{}} selectedStepId={selected?.id ?? null} running={locked} onSelect={setSelectedId} onMove={(id, position) => onMoveSteps({ [id]: position })} /></div>
      <p className="mt-3 text-[9px] leading-relaxed text-muted">Drag to arrange · Select a step to inspect · Save names and layout from the plan.</p>
    </section>
    <div className="mt-5 grid items-start gap-5 lg:grid-cols-[0.85fr_1.15fr]">
      <section className="min-w-0 rounded-xl border border-line bg-surface p-5 xl:p-6" aria-labelledby="canvas-inspector-heading"><h2 id="canvas-inspector-heading" className="text-sm font-semibold">Step inspector</h2><label htmlFor="canvas-selected-step" className="mt-3 block text-[10px] text-muted">Selected step</label><select id="canvas-selected-step" value={selected?.id ?? ''} onChange={(event) => setSelectedId(event.target.value)} className="mt-2 w-full min-w-0 rounded-md border border-line bg-surface px-3 py-2.5 text-[11px] outline-none focus:border-accent">{viewPlan.steps.map((step, index) => <option key={step.id} value={step.id}>{String(index + 1).padStart(2, '0')} · {step.title}</option>)}</select>
        {selected && <CanvasStepInspector key={selected.id + ':' + selected.title} step={selected} state={states[selected.id] ?? 'idle'} connections={{}} output={selectedAttempt?.output} running={locked} webhook={viewPlan.webhooks.find((webhook) => webhook.id === selected.webhookTemplateId)} onRename={onRenameStep} onReviewWebhook={onEditSetup} />}
        {selectedAttempt?.error && <p className="mt-3 text-xs text-danger">{selectedAttempt.error.message}</p>}
      </section>
      <section className="min-w-0 rounded-xl border border-line bg-surface p-5 xl:p-6" aria-labelledby="execution-log-heading"><div className="flex flex-wrap items-center justify-between gap-2"><h2 id="execution-log-heading" className="text-sm font-semibold">Execution log</h2><span className="text-[10px] text-muted">{run ? run.events.length + ' events' : 'No run yet'}</span></div><ExecutionEvents run={run} /><p className="mt-3 text-[10px] leading-relaxed text-muted">Events, inputs, outputs, and repair decisions are saved with the run.</p></section>
    </div>
    <div className="mt-7 flex flex-wrap items-center justify-between gap-4"><Link to={workflowRoutes.plan} className="inline-flex items-center gap-2 rounded-md border border-line bg-surface px-4 py-3 text-xs font-semibold hover:bg-slate-50"><Icon name="back" width="16" height="16" />Back to plan</Link><div className="flex flex-wrap items-center gap-3"><Button variant="secondary" onClick={onEditSetup}>Edit setup and save</Button><Link to={workflowRoutes.logs} className="inline-flex items-center gap-2 rounded-md border border-line bg-surface px-4 py-3 text-xs font-semibold hover:bg-slate-50">Context & logs<Icon name="arrow" width="15" height="15" /></Link></div></div>
    <WorkflowPageFooter step={4} label="RUN ON CANVAS" />
    {inputOpen && <Dialog open title="Run workflow" onClose={() => { if (!execution.busy) setInputOpen(false) }}><p className="text-xs leading-relaxed text-muted">This runs saved version {saved?.version} and can send real webhooks. Muse prepares execution once per saved version; that preparation uses credits. Later runs reuse the configuration.</p><p className="mt-3 text-[11px] leading-relaxed text-muted">Source fields: {plan.steps.find((step) => step.role === 'trigger')?.outputs.map((field) => field.name).join(', ') || 'Use the input described in your prompt.'}</p><form onSubmit={(event) => { event.preventDefault(); let data: RunData; try { const parsed: unknown = JSON.parse(input); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(); data = parsed as RunData } catch { setInputError('Enter a JSON object containing the data your workflow receives.'); return } void execution.start(data, autoRepair).then(() => setInputOpen(false)) }}><label className="mt-4 block text-xs font-medium">Workflow input (JSON)<textarea rows={10} value={input} maxLength={32768} onChange={(event) => { setInput(event.target.value); setInputError('') }} className="mt-2 w-full rounded-lg border border-line bg-surface p-3 font-mono text-xs" /></label><label className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed"><input type="checkbox" checked={autoRepair} onChange={(event) => setAutoRepair(event.target.checked)} />Let Muse suggest a repair if a required field is missing. Suggestions use credits and need approval before resuming.</label><p className="mt-2 text-[10px] text-muted">Use source data only. Keep passwords, API keys, and authentication tokens in backend connection storage.</p>{inputError && <p role="alert" className="mt-3 text-xs text-danger">{inputError}</p>}<div className="mt-5 flex gap-3"><Button type="submit" disabled={execution.busy}>{execution.busy ? 'Starting…' : 'Start run'}</Button><Button variant="secondary" disabled={execution.busy} onClick={() => setInputOpen(false)}>Cancel</Button></div></form></Dialog>}
  </>
}
