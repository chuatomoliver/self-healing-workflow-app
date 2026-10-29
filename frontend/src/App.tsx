import { AppLayout } from './layouts/AppLayout'
import { DescribeUploadPage } from './features/ingestion/pages/DescribeUploadPage'
import { Navigate, Route, Routes, useNavigate } from 'react-router'
import { workflowRoutes } from './app/navigation'
import { useIngestionDraft } from './features/ingestion/hooks/useIngestionDraft'
import { ParseDiagramPage } from './features/diagram-parsing/pages/ParseDiagramPage'
import { sampleDiagram } from './features/diagram-parsing/data/sampleDiagram'

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
            sourceUrl={draft.previewUrl} prompt={draft.prompt} />
        } />
        <Route path="*" element={<Navigate to={workflowRoutes.describe} replace />} />
      </Routes>
    </AppLayout>
  )
}

export default App
