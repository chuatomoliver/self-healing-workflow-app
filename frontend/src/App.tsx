import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { AppLayout } from './layouts/AppLayout'
import { DescribeUploadPage } from './features/ingestion/pages/DescribeUploadPage'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'
import { workflowRoutes } from './app/navigation'
import { useIngestionDraft } from './features/ingestion/hooks/useIngestionDraft'
import { ParseDiagramPage } from './features/diagram-parsing/pages/ParseDiagramPage'
import { sampleDiagram } from './features/diagram-parsing/data/sampleDiagram'
import { samplePlan } from './features/workflows/data/samplePlan'
import { useWebhookConnections } from './features/workflows/hooks/useWebhookConnections'
import { useCanvasDraft } from './features/canvas/hooks/useCanvasDraft'
import { useDemoRun } from './features/canvas/hooks/useDemoRun'
import type { DemoRunFrame } from './features/canvas/types'
import type { WorkflowPlan } from './features/workflows/types'
import { useRepairReview } from './features/healing/hooks/useRepairReview'
import { useSessionHistory } from './features/history/hooks/useSessionHistory'
import { WorkflowStorage } from './features/workflows/components/WorkflowStorage'
import { getWorkflow } from './features/workflows/api'
import { Button } from './components/ui/Button'
import type { SavedWorkflow, WorkflowDraft } from '../../shared/workflows'
import { parseWorkflow } from './features/diagram-parsing/api'

const RunCanvasPage = lazy(() => import('./features/canvas/pages/RunCanvasPage').then((module) => ({ default: module.RunCanvasPage })))
const SelfHealPage = lazy(() => import('./features/healing/pages/SelfHealPage').then((module) => ({ default: module.SelfHealPage })))
const PlanWorkflowPage = lazy(() => import('./features/workflows/pages/PlanWorkflowPage').then((module) => ({ default: module.PlanWorkflowPage })))
const ContextLogsPage = lazy(() => import('./features/history/pages/ContextLogsPage').then((module) => ({ default: module.ContextLogsPage })))

function App() {
  const navigate = useNavigate()
  const [initialId] = useState(() => new URLSearchParams(window.location.search).get('workflow'))
  const [workspace, setWorkspace] = useState<{ workflow: SavedWorkflow | null; draft?: WorkflowDraft; file?: File | null; key: number }>({ workflow: null, key: 0 })
  const [loading, setLoading] = useState(Boolean(initialId))
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!initialId) return
    const controller = new AbortController()
    getWorkflow(initialId, controller.signal).then((workflow) => {
      if (!controller.signal.aborted) setWorkspace({ workflow, key: 1 })
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'The saved workflow could not be opened.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [initialId, retry])
  if (loading || error) return <AppLayout>
    {loading ? <p role="status" className="py-12 text-xs text-muted">Opening saved workflow…</p> : <div className="py-12">
      <p role="alert" className="mb-4 text-xs text-danger">{error}</p>
      <Button onClick={() => { setLoading(true); setError(''); setRetry((value) => value + 1) }}>Try again</Button>
      <a href={workflowRoutes.plan} className="ml-4 text-xs text-accent underline">Return to workflow plans</a>
    </div>}
  </AppLayout>
  return <WorkflowWorkspace key={workspace.key} initialWorkflow={workspace.workflow} initialDraft={workspace.draft} initialFile={workspace.file} onParsed={(draft, file) => {
    setWorkspace((current) => ({ workflow: null, draft, file, key: current.key + 1 }))
    navigate(workflowRoutes.parse)
  }} onOpen={(workflow) => {
    setWorkspace((current) => ({ workflow, key: current.key + 1 }))
    navigate(`${workflowRoutes.plan}?workflow=${encodeURIComponent(workflow.id)}`)
  }} />
}

function WorkflowWorkspace({ initialWorkflow, initialDraft, initialFile, onParsed, onOpen }: {
  initialWorkflow: SavedWorkflow | null
  initialDraft?: WorkflowDraft
  initialFile?: File | null
  onParsed: (draft: WorkflowDraft, file: File | null) => void
  onOpen: (workflow: SavedWorkflow) => void
}) {
  const initial = initialWorkflow ?? initialDraft
  const draft = useIngestionDraft(initial?.prompt, initialFile)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const previousPath = useRef(pathname)
  const [plan, setPlan] = useState<WorkflowPlan>(initial?.plan ?? samplePlan)
  const [savedWorkflow, setSavedWorkflow] = useState(initialWorkflow)
  const diagram = initial?.diagram ?? sampleDiagram
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const parseRequest = useRef<AbortController | null>(null)
  const initialCanvasPositions = Object.fromEntries(diagram.nodes.map((node) => [node.id, node.position]))
  const webhooks = useWebhookConnections(plan.webhooks)
  const canvasDraft = useCanvasDraft(plan, initialCanvasPositions)
  const run = useDemoRun(plan.steps.map((step) => step.id))
  const stopRun = run.stop
  const healing = useRepairReview(run.frame, run.runId, run.scenarioLabel)
  const history = useSessionHistory({ frame: run.frame, runId: run.runId, inputLabel: run.scenarioLabel,
    plan, steps: canvasDraft.steps, prompt: draft.prompt, diagram: draft.diagram, review: healing.review })

  useEffect(() => {
    const leftCanvas = previousPath.current === workflowRoutes.canvas && pathname !== workflowRoutes.canvas
    previousPath.current = pathname
    if (leftCanvas) stopRun()
  }, [pathname, stopRun])

  useEffect(() => () => { parseRequest.current?.abort() }, [])
  useEffect(() => {
    if (pathname !== workflowRoutes.parse) {
      parseRequest.current?.abort()
    }
  }, [pathname])

  async function startParse() {
    if (parseRequest.current) return
    const prepared = draft.prepareDraft()
    if (!prepared) return
    const controller = new AbortController()
    parseRequest.current = controller
    setParsing(true)
    setParseError('')
    navigate(workflowRoutes.parse)
    try {
      const result = await parseWorkflow(prepared.prompt, prepared.diagram, controller.signal)
      if (!controller.signal.aborted) onParsed(result.draft, prepared.diagram)
    } catch (error) {
      if (!controller.signal.aborted) setParseError(error instanceof Error ? error.message : 'The workflow could not be parsed.')
    } finally {
      if (parseRequest.current === controller) { parseRequest.current = null; setParsing(false) }
    }
  }

  function applyRepair(nextPlan: WorkflowPlan, frames: DemoRunFrame[], sourceFrame: DemoRunFrame) {
    if (run.frame !== sourceFrame || run.frame.status !== 'failed') throw new Error('The run has changed. Review its current state before applying a repair.')
    setPlan(nextPlan)
    healing.decide('applied')
    run.resume(frames)
    navigate(workflowRoutes.canvas)
  }

  return (
    <AppLayout>
      <Routes>
        <Route path={workflowRoutes.describe} element={
          <DescribeUploadPage draft={draft} onContinue={() => { void startParse() }} />
        } />
        <Route path={workflowRoutes.parse} element={
          parsing || parseError ? <section className="my-12 rounded-xl border border-line bg-surface p-6" aria-busy={parsing}>
            <h1 className="text-xl font-semibold">{parsing ? 'Parsing your workflow with Muse…' : 'Parsing needs attention'}</h1>
            {parsing ? <p role="status" className="mt-3 text-xs text-muted">Reading the description and diagram. This can take up to 90 seconds.</p>
              : <p role="alert" className="mt-3 text-xs leading-relaxed text-danger">{parseError}</p>}
            <div className="mt-5 flex gap-3">
              {!parsing && <Button onClick={() => { void startParse() }}>Try again</Button>}
              <Button variant="secondary" onClick={() => { parseRequest.current?.abort(); navigate(workflowRoutes.describe) }}>{parsing ? 'Cancel' : 'Back to input'}</Button>
            </div>
          </section> : <ParseDiagramPage result={diagram} sourceFile={draft.diagram}
            sourceUrl={draft.previewUrl} prompt={draft.prompt}
            isSample={diagram.id === sampleDiagram.id} onContinue={() => navigate(workflowRoutes.plan)} />
        } />
        <Route path={workflowRoutes.plan} element={
          <Suspense fallback={<p role="status" className="py-12 text-xs text-muted">Loading plan…</p>}>
            <PlanWorkflowPage plan={plan} prompt={draft.prompt} sourceFile={draft.diagram}
              webhookConnections={webhooks.connections} onConnectWebhook={webhooks.connect}
              storage={<WorkflowStorage draft={{ plan, diagram, prompt: draft.prompt }} saved={savedWorkflow}
                onSaved={(workflow) => {
                  setSavedWorkflow(workflow)
                  navigate(`${workflowRoutes.plan}?workflow=${encodeURIComponent(workflow.id)}`, { replace: true })
                }} onOpen={onOpen} onRename={(title) => setPlan((current) => ({ ...current, title }))} />}
              onContinue={() => navigate(workflowRoutes.canvas)} />
          </Suspense>
        } />
        <Route path={workflowRoutes.canvas} element={
          <Suspense fallback={<p role="status" className="py-12 text-xs text-muted">Loading the canvas…</p>}>
            <RunCanvasPage plan={plan} draft={canvasDraft} webhookConnections={webhooks.connections} allowSamplePlayback={diagram.id === sampleDiagram.id}
              onConnectWebhook={webhooks.connect} run={run} hasRepairReview={healing.review !== null}
              onReviewRepair={() => navigate(workflowRoutes.heal)}
              onViewLogs={() => navigate(run.runId ? `${workflowRoutes.logs}?run=${encodeURIComponent(run.runId)}` : workflowRoutes.logs)} />
          </Suspense>
        } />
        <Route path={workflowRoutes.logs} element={
          <Suspense fallback={<p role="status" className="py-12 text-xs text-muted">Loading history…</p>}>
            <ContextLogsPage runs={history.runs} repairs={history.repairs} />
          </Suspense>
        } />
        <Route path={workflowRoutes.heal} element={
          <Suspense fallback={<p role="status" className="py-12 text-xs text-muted">Loading repair…</p>}>
            <SelfHealPage plan={plan} steps={canvasDraft.steps} review={healing.review} currentFrame={run.frame}
              onVerify={healing.recordChecks} onReopen={() => healing.decide('review')}
              onReject={() => { healing.decide('rejected'); navigate(workflowRoutes.canvas) }} onApply={applyRepair} />
          </Suspense>
        } />
        <Route path="*" element={<Navigate to={workflowRoutes.describe} replace />} />
      </Routes>
    </AppLayout>
  )
}

export default App
