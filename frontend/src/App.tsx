import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'
import { AppLayout } from './layouts/AppLayout'
import { workflowRoutes } from './app/navigation'
import { Button } from './components/ui/Button'
import { DescribeUploadPage } from './features/ingestion/pages/DescribeUploadPage'
import { useIngestionDraft } from './features/ingestion/hooks/useIngestionDraft'
import { ParseDiagramPage } from './features/diagram-parsing/pages/ParseDiagramPage'
import { parseWorkflow } from './features/diagram-parsing/api'
import { generateWorkflowPlan } from './features/workflows/planningApi'
import { WorkflowStorage } from './features/workflows/components/WorkflowStorage'
import { WorkflowEmptyState } from './features/workflows/components/WorkflowEmptyState'
import { getWorkflow, saveWorkflow } from './features/workflows/api'
import type { WorkflowActivity } from './features/history/activity'
import type { ParsedDiagram, SavedWorkflow, WorkflowDraft, WorkflowPlan } from '../../shared/workflows'
import { refreshPlanChecks } from '../../shared/setup'
import { isWorkflowDirty } from './features/workflows/draftState'
import { useWorkflowRuns } from './features/execution/useWorkflowRuns'

const PlanWorkflowPage = lazy(() => import('./features/workflows/pages/PlanWorkflowPage').then((module) => ({ default: module.PlanWorkflowPage })))
const RunCanvasPage = lazy(() => import('./features/canvas/pages/RunCanvasPage').then((module) => ({ default: module.RunCanvasPage })))
const SelfHealPage = lazy(() => import('./features/healing/pages/SelfHealPage').then((module) => ({ default: module.SelfHealPage })))
const ContextLogsPage = lazy(() => import('./features/history/pages/ContextLogsPage').then((module) => ({ default: module.ContextLogsPage })))
type RecordActivity = (kind: WorkflowActivity['kind'], workflow: string, message: string, status?: WorkflowActivity['status']) => void

function diagramWithPlan(diagram: ParsedDiagram, plan: WorkflowPlan): ParsedDiagram {
  return { ...diagram, title: plan.title, nodes: diagram.nodes.map((node) => {
    const step = plan.steps.find((item) => item.id === node.id)
    return step ? { ...node, label: step.title, description: step.description } : node
  }) }
}

function App() {
  const navigate = useNavigate()
  const [initialId] = useState(() => new URLSearchParams(window.location.search).get('workflow'))
  const [workspace, setWorkspace] = useState<{ workflow: SavedWorkflow | null; draft?: WorkflowDraft; file?: File | null; key: number }>({ workflow: null, key: 0 })
  const [activities, setActivities] = useState<WorkflowActivity[]>([])
  const [loading, setLoading] = useState(Boolean(initialId))
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const record: RecordActivity = (kind, workflow, message, status = 'completed') => setActivities((current) => [{ id: crypto.randomUUID(), at: new Date().toISOString(), kind, workflow, message, status }, ...current].slice(0, 100))
  useEffect(() => {
    if (!initialId) return
    const controller = new AbortController()
    getWorkflow(initialId, controller.signal).then((workflow) => {
      if (!controller.signal.aborted) {
        setWorkspace({ workflow, key: 1 })
        setActivities((current) => [{ id: crypto.randomUUID(), at: new Date().toISOString(), kind: 'open', workflow: workflow.plan.title, message: `Opened saved draft version ${workflow.version}.`, status: 'completed' }, ...current])
      }
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'The saved workflow could not be opened.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [initialId, retry])
  if (loading || error) return <AppLayout>{loading ? <p role="status" className="py-12 text-xs text-muted">Opening saved workflow…</p> : <section className="py-12"><p role="alert" className="mb-4 text-xs text-danger">{error}</p><Button onClick={() => { setLoading(true); setError(''); setRetry((value) => value + 1) }}>Try again</Button><a href={workflowRoutes.plan} className="ml-4 text-xs text-accent underline">Return to saved drafts</a></section>}</AppLayout>
  return <WorkflowWorkspace key={workspace.key} initialWorkflow={workspace.workflow} initialDraft={workspace.draft} initialFile={workspace.file} activities={activities} record={record}
    onParsed={(draft, file) => { setWorkspace((current) => ({ workflow: null, draft, file, key: current.key + 1 })); record('parse', draft.plan.title, `Muse prepared ${draft.diagram.nodes.length} steps and ${draft.plan.webhooks.length} webhook suggestions.`); navigate(workflowRoutes.parse) }}
    onOpen={(workflow) => { setWorkspace((current) => ({ workflow, key: current.key + 1 })); record('open', workflow.plan.title, `Opened saved draft version ${workflow.version}.`); navigate(`${workflowRoutes.plan}?workflow=${encodeURIComponent(workflow.id)}`) }} />
}

function WorkflowWorkspace({ initialWorkflow, initialDraft, initialFile, onParsed, onOpen, activities, record }: {
  initialWorkflow: SavedWorkflow | null; initialDraft?: WorkflowDraft; initialFile?: File | null
  onParsed: (draft: WorkflowDraft, file: File | null) => void; onOpen: (workflow: SavedWorkflow) => void
  activities: WorkflowActivity[]; record: RecordActivity
}) {
  const initial = initialWorkflow ?? initialDraft
  const input = useIngestionDraft(initial?.prompt, initialFile)
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const [plan, setPlan] = useState<WorkflowPlan | null>(() => initial ? refreshPlanChecks(initial.plan) : null)
  const [diagram, setDiagram] = useState<ParsedDiagram | null>(initial?.diagram ?? null)
  const [savedWorkflow, setSavedWorkflow] = useState(() => initialWorkflow ? { ...initialWorkflow, plan: refreshPlanChecks(initialWorkflow.plan) } : null)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [planning, setPlanning] = useState(false)
  const [planError, setPlanError] = useState('')
  const parseRequest = useRef<AbortController | null>(null)
  const planRequest = useRef<AbortController | null>(null)
  const currentDraft: WorkflowDraft | null = plan && diagram ? { prompt: input.prompt, plan, diagram } : null
  const savedWorkflowId = savedWorkflow?.id
  const execution = useWorkflowRuns(savedWorkflowId, savedWorkflow?.version)
  useEffect(() => {
    if (!savedWorkflowId || !execution.selectedId || parsing) return
    const params = new URLSearchParams(search)
    if (params.get('run') === execution.selectedId) return
    params.set('workflow', savedWorkflowId); params.set('run', execution.selectedId)
    navigate({ pathname, search: `?${params.toString()}` }, { replace: true })
  }, [savedWorkflowId, execution.selectedId, parsing, pathname, search, navigate])
  useEffect(() => () => { parseRequest.current?.abort(); planRequest.current?.abort() }, [])
  useEffect(() => {
    if (!savedWorkflowId || parsing) return
    const params = new URLSearchParams(search)
    if (params.get('workflow') === savedWorkflowId) return
    // Keep the selected saved draft addressable after navigating and reloading.
    params.set('workflow', savedWorkflowId)
    navigate({ pathname, search: `?${params.toString()}` }, { replace: true })
  }, [savedWorkflowId, pathname, search, parsing, navigate])
  useEffect(() => {
    if (pathname !== workflowRoutes.parse) parseRequest.current?.abort()
    if (pathname !== workflowRoutes.plan) planRequest.current?.abort()
  }, [pathname])
  function changePlan(next: WorkflowPlan, message: string) {
    planRequest.current?.abort()
    applyPlan(next)
    if (message) record('setup', next.title, message)
  }
  function applyPlan(next: WorkflowPlan) {
    setPlan(refreshPlanChecks(next))
    setDiagram((current) => current ? diagramWithPlan(current, next) : current)
  }
  async function startParse() {
    if (parseRequest.current) return
    const prepared = input.prepareDraft()
    if (!prepared) return
    const controller = new AbortController()
    parseRequest.current = controller
    setParsing(true); setParseError(''); navigate(workflowRoutes.parse)
    try {
      const result = await parseWorkflow(prepared.prompt, prepared.diagram, controller.signal)
      if (!controller.signal.aborted) onParsed(result.draft, prepared.diagram)
    } catch (cause) {
      if (!controller.signal.aborted) { const message = cause instanceof Error ? cause.message : 'The workflow could not be parsed.'; setParseError(message); record('parse', plan?.title ?? 'New workflow', message, 'failed') }
    } finally { if (parseRequest.current === controller) { parseRequest.current = null; setParsing(false) } }
  }
  async function startPlanning() {
    if (!currentDraft || planRequest.current) return
    const controller = new AbortController()
    planRequest.current = controller
    setPlanning(true); setPlanError('')
    try {
      const result = await generateWorkflowPlan(currentDraft, controller.signal)
      if (!controller.signal.aborted) { applyPlan(result.plan); record('plan', result.plan.title, `Muse proposed operations and settings for ${result.plan.steps.length} steps.`) }
    } catch (cause) {
      if (!controller.signal.aborted) { const message = cause instanceof Error ? cause.message : 'Planning could not finish.'; setPlanError(message); record('plan', currentDraft.plan.title, message, 'failed') }
    } finally { if (planRequest.current === controller) { planRequest.current = null; setPlanning(false) } }
  }
  function renameStep(id: string, title: string) {
    if (!plan || !diagram || !title.trim() || title.trim().length > 200) return
    changePlan({ ...plan, steps: plan.steps.map((step) => step.id === id ? { ...step, title: title.trim(), reviewed: false, configuredBy: undefined } : step) }, 'Updated a step name on the canvas.')
    setDiagram({ ...diagram, nodes: diagram.nodes.map((node) => node.id === id ? { ...node, label: title.trim() } : node) })
  }
  function moveSteps(positions: Record<string, { x: number; y: number }>) {
    if (!diagram) return
    setDiagram({ ...diagram, nodes: diagram.nodes.map((node) => {
      const position = positions[node.id]
      return position && Number.isFinite(position.x) && Number.isFinite(position.y) ? { ...node, position: { x: Math.max(-100000, Math.min(100000, position.x)), y: Math.max(-100000, Math.min(100000, position.y)) } } : node
    }) })
  }
  function didSave(workflow: SavedWorkflow) {
    setSavedWorkflow(workflow)
    record('save', workflow.plan.title, `Saved draft version ${workflow.version}.`)
    const params = new URLSearchParams(search)
    params.set('workflow', workflow.id)
    navigate({ pathname, search: `?${params.toString()}` }, { replace: true })
  }
  async function saveCanvasDraft() {
    if (!currentDraft) throw new Error('Open a workflow before saving.')
    didSave(await saveWorkflow(currentDraft, savedWorkflow))
  }
  function buildOnCanvas() {
    if (!currentDraft || !savedWorkflow || isWorkflowDirty(currentDraft, savedWorkflow)) return
    navigate(`${workflowRoutes.canvas}?workflow=${encodeURIComponent(savedWorkflow.id)}`)
  }
  const storage = <WorkflowStorage draft={currentDraft} saved={savedWorkflow} onSaved={didSave} onOpen={onOpen} onRename={(title) => { if (plan) changePlan({ ...plan, title }, '') }} />
  const noWorkflow = (title: string) => <WorkflowEmptyState title={title} description="Your workflow will appear here after parsing. You can also open a saved draft in Plan Workflow." />
  return <AppLayout><Suspense fallback={<p role="status" className="py-12 text-xs text-muted">Loading workflow page…</p>}><Routes>
    <Route path={workflowRoutes.describe} element={<DescribeUploadPage draft={input} onContinue={() => { void startParse() }} />} />
    <Route path={workflowRoutes.parse} element={parsing || parseError ? <section className="my-12 rounded-xl border border-line bg-surface p-6" aria-busy={parsing}><h1 className="text-xl font-semibold">{parsing ? 'Preparing your workflow with Muse…' : 'Parsing needs attention'}</h1>{parsing ? <p role="status" className="mt-3 text-xs text-muted">Building the steps and configuring their setup in one request. This can take up to 90 seconds.</p> : <p role="alert" className="mt-3 text-xs leading-relaxed text-danger">{parseError}</p>}<div className="mt-5 flex gap-3">{!parsing && <Button onClick={() => { void startParse() }}>Try again</Button>}<Button variant="secondary" onClick={() => { parseRequest.current?.abort(); if (parsing) record('parse', plan?.title ?? 'New workflow', 'Cancelled parsing. The request may already have reached Muse.', 'cancelled'); navigate(workflowRoutes.describe) }}>{parsing ? 'Cancel' : 'Back to input'}</Button></div></section> : diagram && plan ? <ParseDiagramPage result={diagram} sourceFile={input.diagram} sourceUrl={input.previewUrl} prompt={input.prompt} onContinue={() => { changePlan({ ...plan, structureReviewed: true }, 'Reviewed the workflow structure.'); navigate(workflowRoutes.plan) }} /> : noWorkflow('No workflow to review yet')} />
    <Route path={workflowRoutes.plan} element={plan && diagram ? <PlanWorkflowPage plan={plan} prompt={input.prompt} sourceFile={input.diagram} storage={storage} onChangePlan={changePlan} planning={planning} planError={planError} saved={savedWorkflow} canDeliver={!!currentDraft && !isWorkflowDirty(currentDraft, savedWorkflow)} onGeneratePlan={() => { void startPlanning() }} onCancelPlanning={() => { planRequest.current?.abort(); record('plan', plan.title, 'Cancelled detailed planning. The request may already have reached Muse.', 'cancelled') }} onContinue={buildOnCanvas} /> : <>{noWorkflow('Create or open a workflow')}{storage}</>} />
    <Route path={workflowRoutes.canvas} element={plan && diagram ? <RunCanvasPage plan={plan} diagram={diagram} saved={savedWorkflow} canRun={!!currentDraft && !!savedWorkflow && !isWorkflowDirty(currentDraft, savedWorkflow)} execution={execution} onSave={saveCanvasDraft} onRenameStep={renameStep} onMoveSteps={moveSteps} onEditSetup={() => navigate(workflowRoutes.plan)} /> : noWorkflow('Your workflow canvas is empty')} />
    <Route path={workflowRoutes.heal} element={<SelfHealPage plan={plan} execution={execution} />} />
    <Route path={workflowRoutes.logs} element={<ContextLogsPage plan={plan} activities={activities} execution={execution} />} />
    <Route path="*" element={<Navigate to={workflowRoutes.describe} replace />} />
  </Routes></Suspense></AppLayout>
}
export default App
