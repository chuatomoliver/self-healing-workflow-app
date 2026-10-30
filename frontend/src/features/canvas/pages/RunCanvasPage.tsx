import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { workflowRoutes } from '../../../app/navigation'
import { Button } from '../../../components/ui/Button'
import { Icon } from '../../../components/ui/Icon'
import { WebhookTemplateDialog } from '../../workflows/components/WebhookTemplateDialog'
import type { PlanWebhookTemplate, WebhookConnectionState, WorkflowPlan } from '../../workflows/types'
import { CanvasStepInspector } from '../components/CanvasStepInspector'
import { DemoExecutionLog } from '../components/DemoExecutionLog'
import { WorkflowCanvas } from '../components/WorkflowCanvas'
import { getSampleScenarios } from '../data/sampleScenarios'
import type { useCanvasDraft } from '../hooks/useCanvasDraft'
import type { useDemoRun } from '../hooks/useDemoRun'

type RunCanvasPageProps = {
  plan: WorkflowPlan
  draft: ReturnType<typeof useCanvasDraft>
  webhookConnections: WebhookConnectionState
  onConnectWebhook: (templateId: string) => void
  run: ReturnType<typeof useDemoRun>
  hasRepairReview: boolean
  onReviewRepair: () => void
}

const runPresentation = {
  running: { label: 'Running', colors: 'bg-accent-soft text-accent' },
  succeeded: { label: 'Completed', colors: 'bg-emerald-50 text-emerald-800' },
  failed: { label: 'Failed', colors: 'bg-red-50 text-danger' },
  stopped: { label: 'Stopped', colors: 'bg-amber-50 text-amber-800' },
}

export function RunCanvasPage({ plan, draft, webhookConnections, onConnectWebhook, run, hasRepairReview, onReviewRepair }: RunCanvasPageProps) {
  const scenarios = getSampleScenarios(plan)
  const [selectedStepId, setSelectedStepId] = useState(plan.steps[0]?.id ?? '')
  const [scenarioId, setScenarioId] = useState(scenarios[0].id)
  const [reviewWebhook, setReviewWebhook] = useState<PlanWebhookTemplate | null>(null)
  const [connectionMessage, setConnectionMessage] = useState('')
  const inspectorRef = useRef<HTMLElement>(null)
  const selectedStep = draft.steps.find((step) => step.id === selectedStepId) ?? draft.steps[0]
  const scenario = scenarios.find((item) => item.id === scenarioId) ?? scenarios[0]
  const connectedCount = plan.webhooks.filter((webhook) => webhookConnections[webhook.id] === 'connected-demo').length
  const presentation = run.frame ? runPresentation[run.frame.status] : { label: 'Ready', colors: 'bg-slate-100 text-muted' }

  function inspectFailure(stepId: string) {
    setSelectedStepId(stepId)
    requestAnimationFrame(() => inspectorRef.current?.focus())
  }

  function connectWebhook(templateId: string) {
    onConnectWebhook(templateId)
    const template = plan.webhooks.find((item) => item.id === templateId)
    setConnectionMessage(`${template?.name ?? 'Webhook'} connected.`)
  }

  return <>
    <div className="text-[9px] font-semibold tracking-[1.5px] text-muted">WORKFLOW BUILDER</div>
    <header className="mt-8 mb-7 md:mt-10 md:mb-8">
      <p className="mb-4 flex items-center gap-2 text-[10px] font-bold tracking-[1.4px] text-accent"><span className="size-1.5 rounded-full bg-accent" />STEP 4 OF 6 · CANVAS & EXECUTION</p>
      <h1 className="mb-4 text-[clamp(1.875rem,3vw,2.625rem)] leading-tight font-[650] tracking-[-1.3px]">Run it on the canvas.</h1>
      <p className="max-w-2xl text-xs leading-[1.8] text-muted md:text-[13px]">Arrange steps and inspect execution results.</p>
    </header>

    <section className="min-w-0 rounded-xl border border-line bg-surface p-4 sm:p-5 xl:p-6" aria-labelledby="canvas-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 id="canvas-heading" className="text-sm font-semibold">{plan.title}</h2><p className="mt-2 text-[10px] leading-relaxed text-muted">{draft.steps.length} steps · {plan.edges.length} paths · {connectedCount}/{plan.webhooks.length} webhooks connected</p></div>
        <span className={`rounded-md px-2.5 py-1.5 text-[10px] font-medium ${presentation.colors}`}>{presentation.label}</span>
      </div>
      <div className="mt-5 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-slate-50/70 p-3.5">
        <div className="min-w-0 flex-1 basis-56"><label htmlFor="canvas-demo-input" className="text-[10px] font-semibold">Run input</label>
          <select id="canvas-demo-input" value={scenarioId} disabled={run.running} onChange={(event) => setScenarioId(event.target.value)}
            className="mt-2 w-full min-w-0 rounded-md border border-line bg-surface px-3 py-2.5 text-[11px] outline-none focus:border-accent focus:ring-3 focus:ring-accent/10 disabled:opacity-60">
            {scenarios.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          {run.running ? <Button variant="secondary" onClick={run.stop}><Icon name="stop" width="14" height="14" />Stop</Button>
            : <Button onClick={() => run.start(scenario)} disabled={draft.steps.length === 0}><Icon name="play" width="15" height="15" />{run.frame ? 'Run again' : 'Run workflow'}</Button>}
          <Button variant="secondary" disabled={run.running} onClick={draft.resetLayout}><Icon name="reset" width="14" height="14" />Reset layout</Button>
        </div>
      </div>
      <div className="mt-4">
        <WorkflowCanvas steps={draft.steps} paths={plan.edges} positions={draft.positions} states={run.frame?.stepStates ?? {}}
          webhookConnections={webhookConnections} selectedStepId={selectedStep?.id ?? null} running={run.running}
          onSelect={setSelectedStepId} onMove={draft.moveStep} />
      </div>
      <p className="mt-3 text-[9px] leading-relaxed text-muted">Drag to arrange · Select a step to inspect</p>
    </section>

    <p role="status" className="sr-only">{connectionMessage}</p>

    <div className="mt-5 grid items-start gap-5 lg:grid-cols-[0.85fr_1.15fr]">
      <section ref={inspectorRef} tabIndex={-1} className="min-w-0 rounded-xl border border-line bg-surface p-5 xl:p-6" aria-labelledby="canvas-inspector-heading">
        <h2 id="canvas-inspector-heading" className="text-sm font-semibold">Step inspector</h2>
        <label htmlFor="canvas-selected-step" className="mt-3 block text-[10px] text-muted">Selected step</label>
        <select id="canvas-selected-step" value={selectedStep?.id ?? ''} onChange={(event) => setSelectedStepId(event.target.value)}
          className="mt-2 w-full min-w-0 rounded-md border border-line bg-surface px-3 py-2.5 text-[11px] outline-none focus:border-accent focus:ring-3 focus:ring-accent/10">
          {draft.steps.map((step, index) => <option key={step.id} value={step.id}>{String(index + 1).padStart(2, '0')} · {step.title}</option>)}
        </select>
        {selectedStep && <CanvasStepInspector key={selectedStep.id} step={selectedStep} state={run.frame?.stepStates[selectedStep.id] ?? 'idle'} running={run.running}
          webhook={plan.webhooks.find((item) => item.id === selectedStep.webhookTemplateId)} connections={webhookConnections}
          output={run.frame?.outputs[selectedStep.id]} onRename={draft.renameStep} onReviewWebhook={setReviewWebhook} />}
      </section>
      <DemoExecutionLog frame={run.frame} runId={run.runId} scenarioLabel={run.scenarioLabel} steps={draft.steps} onInspectFailure={inspectFailure} onReviewRepair={onReviewRepair} />
    </div>

    <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
      <Link to={workflowRoutes.plan} className="inline-flex items-center gap-2 rounded-md border border-line bg-surface px-4 py-3 text-xs font-semibold transition-colors duration-200 hover:bg-slate-50 motion-reduce:transition-none"><Icon name="back" width="16" height="16" />Back to plan</Link>
      <div className="flex flex-col items-end gap-2"><Button disabled={!hasRepairReview || run.running} onClick={onReviewRepair} aria-describedby={!hasRepairReview ? 'healing-pending' : undefined}>Continue to self-heal<Icon name="arrow" width="17" height="17" /></Button>{!hasRepairReview && <p id="healing-pending" className="text-[10px] text-muted">No failed steps to review</p>}</div>
    </div>
    <footer className="mt-8 flex items-center justify-between border-t border-line pt-5 text-[8px] tracking-[1.5px] text-muted md:mt-10"><span>RUN ON CANVAS</span><span className="font-semibold tracking-wide text-accent">04 <span className="mx-2 text-slate-400">/</span> 06</span></footer>
    <WebhookTemplateDialog template={reviewWebhook} connections={webhookConnections} onConnect={connectWebhook} onClose={() => setReviewWebhook(null)} />
  </>
}
