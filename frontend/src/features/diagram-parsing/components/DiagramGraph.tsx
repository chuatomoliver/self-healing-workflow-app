import { useMemo } from 'react'
import { Background, Controls, Handle, MarkerType, Position, ReactFlow } from '@xyflow/react'
import type { Edge, Node, NodeProps } from '@xyflow/react'
import { Icon } from '../../../components/ui/Icon'
import { nodeRoles } from '../presentation'
import type { DiagramNode, ParsedDiagram } from '../types'
import '@xyflow/react/dist/style.css'

type FlowNode = Node<{ node: DiagramNode }, 'diagram'>

function DiagramNodeCard({ data, selected }: NodeProps<FlowNode>) {
  const { node } = data
  const presentation = nodeRoles[node.role]

  return (
    <div className={`w-46 rounded-xl border bg-surface p-3.5 text-left shadow-xs transition-[border-color,box-shadow] duration-200 motion-reduce:transition-none ${selected ? 'border-accent ring-3 ring-accent/10' : 'border-slate-200 hover:border-accent/50'}`}>
      <Handle type="target" position={Position.Left} className="size-1.5! border-0! bg-slate-300!" />
      <div className="mb-3 flex items-center justify-between">
        <span className={`flex items-center gap-1.5 rounded px-1.5 py-1 text-[9px] font-semibold ${presentation.colors}`}>
          <Icon name={presentation.icon} width="12" height="12" />{presentation.label}
        </span>
        <span className="text-[9px] text-slate-400">{node.id.toUpperCase()}</span>
      </div>
      <p className="text-[12px] leading-relaxed font-semibold text-ink">{node.label}</p>
      <p className="mt-1 text-[10px] text-muted">{node.app ?? 'Workflow logic'}</p>
      {node.reviewNote && <p className="mt-2 flex items-center gap-1 text-[9px] font-medium text-amber-700">
        <span className="size-1 rounded-full bg-amber-500" />Needs review
      </p>}
      <Handle type="source" position={Position.Right} className="size-1.5! border-0! bg-slate-300!" />
    </div>
  )
}

const nodeTypes = { diagram: DiagramNodeCard }

type DiagramGraphProps = {
  result: ParsedDiagram
  selectedNodeId: string | null
  onSelectNode: (id: string) => void
}

export function DiagramGraph({ result, selectedNodeId, onSelectNode }: DiagramGraphProps) {
  const nodes = useMemo<FlowNode[]>(() => result.nodes.map((node) => ({
    id: node.id, type: 'diagram', position: node.position, data: { node },
    selected: node.id === selectedNodeId,
    ariaLabel: `${nodeRoles[node.role].label}: ${node.label}`,
  })), [result.nodes, selectedNodeId])

  const edges = useMemo<Edge[]>(() => result.edges.map((edge) => ({
    ...edge, type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: '#a4aec4', width: 16, height: 16 },
    style: { stroke: '#a4aec4', strokeWidth: 1.5 },
    labelStyle: { fontSize: 10, fill: '#697080' },
    labelBgStyle: { fill: '#ffffff' }, labelBgPadding: [6, 4], labelBgBorderRadius: 4,
  })), [result.edges])

  if (nodes.length === 0) return <p className="grid min-h-64 place-items-center text-sm text-muted">No diagram steps to display yet.</p>

  return (
    <div className="h-72 overflow-hidden rounded-lg border border-line bg-[#fcfcff] sm:h-88 lg:h-92" aria-label="Suggested workflow graph">
      <ReactFlow<FlowNode>
        nodes={nodes} edges={edges} nodeTypes={nodeTypes}
        onNodeClick={(_, node) => onSelectNode(node.id)}
        onNodesChange={(changes) => {
          for (const change of changes) {
            if (change.type === 'select' && change.selected) onSelectNode(change.id)
          }
        }}
        fitView fitViewOptions={{ padding: 0.15 }} minZoom={0.25} maxZoom={1.5}
        nodesDraggable={false} nodesConnectable={false} edgesReconnectable={false}
        zoomOnScroll={false} preventScrolling={false} colorMode="light">
        <Background gap={22} size={1} color="#e1e5ef" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
