import { Icon } from '../../../components/ui/Icon'
import { NodeRoleBadge } from './NodeRoleBadge'
import type { DiagramNode } from '../types'

type ExtractedNodesProps = {
  nodes: DiagramNode[]
  selectedNodeId: string | null
  onSelectNode: (id: string) => void
}

export function ExtractedNodes({ nodes, selectedNodeId, onSelectNode }: ExtractedNodesProps) {
  return <section className="min-w-0 rounded-xl border border-line bg-surface p-5 xl:p-6" aria-labelledby="nodes-heading">
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 id="nodes-heading" className="text-sm font-semibold">Extracted nodes</h2>
      <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] text-muted">{nodes.length} steps</span>
    </div>
    <div className="grid gap-2">
      {nodes.map((node, index) => <button key={node.id} type="button"
        aria-pressed={node.id === selectedNodeId} onClick={() => onSelectNode(node.id)}
        className={`flex w-full cursor-pointer items-center gap-3 rounded-lg border p-3 text-left transition-colors duration-200 motion-reduce:transition-none ${node.id === selectedNodeId ? 'border-accent/25 bg-accent-soft/60' : 'border-transparent hover:border-line hover:bg-slate-50'}`}>
        <span className="grid size-7 shrink-0 place-items-center rounded-md border border-line bg-white text-[10px] font-medium text-muted">{String(index + 1).padStart(2, '0')}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs leading-relaxed font-medium">{node.label}</span>
          <span className="mt-0.5 block text-[10px] text-muted">{node.app ?? 'Workflow logic'}</span>
        </span>
        {node.reviewNote && <Icon name="info" width="14" height="14" className="shrink-0 text-amber-600" />}
        <NodeRoleBadge role={node.role} />
      </button>)}
      {nodes.length === 0 && <p className="py-6 text-xs text-muted">Extracted steps will appear here.</p>}
    </div>
  </section>
}
