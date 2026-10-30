import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { AppLayout } from './layouts/AppLayout'
import { DescribeUploadPage } from './features/ingestion/pages/DescribeUploadPage'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'
import { workflowRoutes } from './app/navigation'
import { useIngestionDraft } from './features/ingestion/hooks/useIngestionDraft'
import { ParseDiagramPage } from './features/diagram-parsing/pages/ParseDiagramPage'
import { sampleDiagram } from './features/diagram-parsing/data/sampleDiagram'
import { PlanWorkflowPage } from './features/workflows/pages/PlanWorkflowPage'
import { samplePlan } from './features/workflows/data/samplePlan'
import { useWebhookConnections } from './features/workflows/hooks/useWebhookConnections'
import { useCanvasDraft } from './features/canvas/hooks/useCanvasDraft'
import { useDemoRun } from './features/canvas/hooks/useDemoRun'
import type { DemoRunFrame } from './features/canvas/types'
import type { WorkflowPlan } from './features/workflows/types'
import { useRepairReview } from './features/healing/hooks/useRepairReview'

const RunCanvasPage = lazy(() => import('./features/canvas/pages/RunCanvasPage').then((module) => ({ default: module.RunCanvasPage })))
const SelfHealPage = lazy(() => import('./features/healing/pages/SelfHealPage').then((module) => ({ default: module.SelfHealPage })))

const initialCanvasPositions = Object.fromEntries(sampleDiagram.nodes.map((node) => [node.id, node.position]))

function App() {
  const draft = useIngestionDraft()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const previousPath = useRef(pathname)
  const [plan, setPlan] = useState<WorkflowPlan>(samplePlan)
  const webhooks = useWebhookConnections(plan.webhooks)
  const canvasDraft = useCanvasDraft(plan, initialCanvasPositions)
  const run = useDemoRun(plan.steps.map((step) => step.id))
  const healing = useRepairReview(run.frame, run.runId, run.scenarioLabel)

  useEffect(() => {
    const leftCanvas = previousPath.current === workflowRoutes.canvas && pathname !== workflowRoutes.canvas
    previousPath.current = pathname
    if (leftCanvas) run.stop()
  }, [pathname, run.stop])

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
          <DescribeUploadPage draft={draft} onContinue={() => navigate(workflowRoutes.parse)} />
        } />
        <Route path={workflowRoutes.parse} element={
          <ParseDiagramPage result={sampleDiagram} sourceFile={draft.diagram}
            sourceUrl={draft.previewUrl} prompt={draft.prompt}
            onContinue={() => navigate(workflowRoutes.plan)} />
        } />
        <Route path={workflowRoutes.plan} element={
          <PlanWorkflowPage plan={plan} prompt={draft.prompt} sourceFile={draft.diagram}
            webhookConnections={webhooks.connections} onConnectWebhook={webhooks.connect}
            onContinue={() => navigate(workflowRoutes.canvas)} />
        } />
        <Route path={workflowRoutes.canvas} element={
          <Suspense fallback={<p role="status" className="py-12 text-xs text-muted">Loading the canvas…</p>}>
            <RunCanvasPage plan={plan} draft={canvasDraft} webhookConnections={webhooks.connections}
              onConnectWebhook={webhooks.connect} run={run} hasRepairReview={healing.review !== null}
              onReviewRepair={() => navigate(workflowRoutes.heal)} />
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
