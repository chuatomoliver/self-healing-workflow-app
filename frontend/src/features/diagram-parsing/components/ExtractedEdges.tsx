import { Icon } from '../../../components/ui/Icon'
import type { DiagramEdge, DiagramNode } from '../types'

export function ExtractedEdges({ nodes, edges }: { nodes: DiagramNode[]; edges: DiagramEdge[] }) {
  const nodeLabels = new Map(nodes.map((node) => [node.id, node.label]))

  return <section className="min-w-0 rounded-xl border border-line bg-surface p-5 xl:p-6" aria-labelledby="edges-heading">
    <div className="mb-1 flex items-center justify-between gap-3">
      <h2 id="edges-heading" className="text-sm font-semibold">Extracted edges</h2>
      <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] text-muted">{edges.length} connections</span>
    </div>
    <p className="mb-5 text-[11px] leading-relaxed text-muted">Arrows show which step follows and where the flow branches.</p>
    <ol className="grid gap-2.5">
      {edges.map((edge) => <li key={edge.id} className="rounded-lg border border-line bg-slate-50/70 p-3.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[9px] font-medium tracking-wide text-muted">{edge.id.toUpperCase()}</span>
          {edge.label && <span className="rounded bg-white px-1.5 py-0.5 text-[9px] font-medium text-accent">{edge.label}</span>}
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[11px] leading-relaxed">
          <span>{nodeLabels.get(edge.source) ?? edge.source}</span>
          <Icon name="arrow" width="16" height="16" className="text-slate-400" />
          <span>{nodeLabels.get(edge.target) ?? edge.target}</span>
        </div>
      </li>)}
    </ol>
    {edges.length === 0 && <p className="py-6 text-xs text-muted">Connections between steps will appear here.</p>}
  </section>
}
