import { lazy, Suspense } from 'react'
import { AppLayout } from './layouts/AppLayout'
import { DescribeUploadPage } from './features/ingestion/pages/DescribeUploadPage'
import { Navigate, Route, Routes, useNavigate } from 'react-router'
import { workflowRoutes } from './app/navigation'
import { useIngestionDraft } from './features/ingestion/hooks/useIngestionDraft'
import { ParseDiagramPage } from './features/diagram-parsing/pages/ParseDiagramPage'
import { sampleDiagram } from './features/diagram-parsing/data/sampleDiagram'
import { PlanWorkflowPage } from './features/workflows/pages/PlanWorkflowPage'
import { samplePlan } from './features/workflows/data/samplePlan'
import { useWebhookConnections } from './features/workflows/hooks/useWebhookConnections'
import { useCanvasDraft } from './features/canvas/hooks/useCanvasDraft'

const RunCanvasPage = lazy(() => import('./features/canvas/pages/RunCanvasPage').then((module) => ({ default: module.RunCanvasPage })))

const initialCanvasPositions = Object.fromEntries(sampleDiagram.nodes.map((node) => [node.id, node.position]))

function App() {
  const draft = useIngestionDraft()
  const navigate = useNavigate()
  const webhooks = useWebhookConnections(samplePlan.webhooks)
  const canvasDraft = useCanvasDraft(samplePlan, initialCanvasPositions)

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
          <PlanWorkflowPage plan={samplePlan} prompt={draft.prompt} sourceFile={draft.diagram}
            webhookConnections={webhooks.connections} onConnectWebhook={webhooks.connect}
            onContinue={() => navigate(workflowRoutes.canvas)} />
        } />
        <Route path={workflowRoutes.canvas} element={
          <Suspense fallback={<p role="status" className="py-12 text-xs text-muted">Loading the canvas…</p>}>
            <RunCanvasPage plan={samplePlan} draft={canvasDraft} webhookConnections={webhooks.connections}
              onConnectWebhook={webhooks.connect} />
          </Suspense>
        } />
        <Route path="*" element={<Navigate to={workflowRoutes.describe} replace />} />
      </Routes>
    </AppLayout>
  )
}

export default App
