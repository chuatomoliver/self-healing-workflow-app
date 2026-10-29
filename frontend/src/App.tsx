import { AppLayout } from './layouts/AppLayout'
import { DescribeUploadPage } from './features/ingestion/pages/DescribeUploadPage'
import { Navigate, Route, Routes, useNavigate } from 'react-router'
import { workflowRoutes } from './app/navigation'
import { useIngestionDraft } from './features/ingestion/hooks/useIngestionDraft'
import { ParseDiagramPage } from './features/diagram-parsing/pages/ParseDiagramPage'
import { sampleDiagram } from './features/diagram-parsing/data/sampleDiagram'
import { PlanWorkflowPage } from './features/workflows/pages/PlanWorkflowPage'
import { samplePlan } from './features/workflows/data/samplePlan'

function App() {
  const draft = useIngestionDraft()
  const navigate = useNavigate()

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
          <PlanWorkflowPage plan={samplePlan} prompt={draft.prompt} sourceFile={draft.diagram} />
        } />
        <Route path="*" element={<Navigate to={workflowRoutes.describe} replace />} />
      </Routes>
    </AppLayout>
  )
}

export default App
