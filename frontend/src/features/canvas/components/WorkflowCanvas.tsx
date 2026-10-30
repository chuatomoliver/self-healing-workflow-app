import { useMemo, useState } from 'react'
import { Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow } from '@xyflow/react'
import type { Edge, Node, NodeProps } from '@xyflow/react'
import { NodeRoleBadge } from '../../diagram-parsing/components/NodeRoleBadge'
import type { DiagramEdge } from '../../diagram-parsing/types'
import type { PlanStep, WebhookConnectionState } from '../../workflows/types'
import { canvasStepStates } from '../presentation'
import type { CanvasPosition, CanvasPositions, CanvasStepStatus } from '../types'
import '@xyflow/react/dist/style.css'

type CanvasNode = Node<{
  step: PlanStep; status: CanvasStepStatus; connected: boolean; hasInput: boolean; hasOutput: boolean
}, 'workflow'>

function CanvasNodeCard({ data, selected }: NodeProps<CanvasNode>) {
  const state = canvasStepStates[data.status]
  return <div className={`w-46 rounded-xl border bg-surface p-3.5 text-left shadow-xs transition-[border-color,box-shadow] duration-200 motion-reduce:transition-none ${state.border} ${selected ? 'ring-3 ring-accent/15' : ''}`}>
    {data.hasInput && <Handle type="target" position={Position.Left} className="size-1.5! border-0! bg-slate-300!" />}
    <div className="flex items-center justify-between gap-2"><NodeRoleBadge role={data.step.role} /><span className="text-[9px] text-slate-400">{data.step.id.toUpperCase()}</span></div>
    <p className="mt-3 text-xs leading-relaxed font-semibold wrap-anywhere">{data.step.title}</p>
    <p className="mt-1 text-[10px] leading-relaxed text-muted">{data.step.operation}</p>
    {data.step.webhookTemplateId && <p className={`mt-2 text-[9px] ${data.connected ? 'text-emerald-700' : 'text-amber-700'}`}>{data.connected ? 'Webhook connected' : 'Webhook suggested'}</p>}
    <p className={`mt-3 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[9px] font-medium ${state.colors}`}>
      <span className={`size-1.5 shrink-0 rounded-full bg-current ${data.status === 'running' ? 'motion-safe:animate-pulse' : ''}`} />{state.label}
    </p>
    {data.hasOutput && <Handle type="source" position={Position.Right} className="size-1.5! border-0! bg-slate-300!" />}
  </div>
}

const nodeTypes = { workflow: CanvasNodeCard }

type WorkflowCanvasProps = {
  steps: PlanStep[]
  paths: DiagramEdge[]
  positions: CanvasPositions
  states: Record<string, CanvasStepStatus>
  webhookConnections: WebhookConnectionState
  selectedStepId: string | null
  running: boolean
  onSelect: (id: string) => void
  onMove: (id: string, position: CanvasPosition) => void
}

export function WorkflowCanvas({ steps, paths, positions, states, webhookConnections, selectedStepId, running, onSelect, onMove }: WorkflowCanvasProps) {
  const [measurements, setMeasurements] = useState<Record<string, { width: number; height: number }>>({})
  const nodes = useMemo<CanvasNode[]>(() => steps.map((step, index) => ({
    id: step.id, type: 'workflow', position: positions[step.id] ?? { x: index * 235, y: 100 },
    measured: measurements[step.id],
    data: { step, status: states[step.id] ?? 'idle', connected: webhookConnections[step.webhookTemplateId ?? ''] === 'connected-demo',
      hasInput: paths.some((path) => path.target === step.id), hasOutput: paths.some((path) => path.source === step.id) },
    selected: step.id === selectedStepId,
    ariaLabel: `${step.title}, ${canvasStepStates[states[step.id] ?? 'idle'].label}`,
  })), [steps, positions, states, webhookConnections, paths, selectedStepId, measurements])

  const edges = useMemo<Edge[]>(() => paths.map((path) => {
    const targetState = states[path.target]
    const active = states[path.source] === 'succeeded' && targetState && !['idle', 'skipped'].includes(targetState)
    const color = active ? targetState === 'failed' ? '#b93829' : '#3656ee' : '#a4aec4'
    return {
      ...path, type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
      style: { stroke: color, strokeWidth: active ? 2 : 1.5, opacity: targetState === 'skipped' ? 0.4 : 1 },
      labelStyle: { fontSize: 10, fill: '#697080' }, labelBgStyle: { fill: '#fff' },
      labelBgPadding: [6, 4], labelBgBorderRadius: 4,
    }
  }), [paths, states])

  return <div className="h-88 overflow-hidden rounded-lg border border-line bg-[#fcfcff] sm:h-108" aria-label="Editable workflow canvas">
    <ReactFlow<CanvasNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes}
      onNodeClick={(_, node) => onSelect(node.id)}
      onNodesChange={(changes) => {
        const dimensions = changes.filter((change) => change.type === 'dimensions')
        if (dimensions.length) setMeasurements((current) => {
          const next = { ...current }
          let changed = false
          for (const change of dimensions) {
            const size = change.dimensions
            if (!size) continue
            if (current[change.id]?.width !== size.width || current[change.id]?.height !== size.height) {
              next[change.id] = size
              changed = true
            }
          }
          return changed ? next : current
        })
        for (const change of changes) {
          if (change.type === 'position' && change.position && !running) onMove(change.id, change.position)
          if (change.type === 'select' && change.selected) onSelect(change.id)
        }
      }}
      nodesDraggable={!running} nodesConnectable={false} edgesReconnectable={false}
      edgesFocusable={false} deleteKeyCode={null}
      fitView fitViewOptions={{ padding: 0.18 }} minZoom={0.25} maxZoom={1.75}
      zoomOnScroll={false} preventScrolling={false} colorMode="light">
      <Background gap={22} size={1} color="#e1e5ef" />
      <Controls showInteractive={false} />
      <MiniMap position="bottom-left" className="hidden sm:block" style={{ width: 112, height: 72, marginLeft: 56 }} pannable zoomable nodeColor="#dce3ff" maskColor="rgba(248,249,251,0.65)" />
    </ReactFlow>
  </div>
}
