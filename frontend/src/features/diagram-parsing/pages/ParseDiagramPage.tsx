import { useState } from 'react'
import { Link } from 'react-router'
import { workflowRoutes } from '../../../app/navigation'
import { Button } from '../../../components/ui/Button'
import { Icon } from '../../../components/ui/Icon'
import { formatFileSize } from '../../ingestion/validation'
import { DiagramGraph } from '../components/DiagramGraph'
import { ExtractedNodes } from '../components/ExtractedNodes'
import { ExtractedEdges } from '../components/ExtractedEdges'
import { NodeRoleBadge } from '../components/NodeRoleBadge'
import type { ParsedDiagram } from '../types'

type ParseDiagramPageProps = {
  result: ParsedDiagram
  sourceFile: File | null
  sourceUrl: string | null
  prompt: string
  onContinue: () => void
}

export function ParseDiagramPage({ result, sourceFile, sourceUrl, prompt, onContinue }: ParseDiagramPageProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(result.nodes[0]?.id ?? null)
  const selectedNode = result.nodes.find((node) => node.id === selectedNodeId) ?? result.nodes[0]
  const reviewNodes = result.nodes.filter((node) => node.reviewNote)

  return (
    <>
      <div className="text-[9px] font-semibold tracking-[1.5px] text-muted">WORKFLOW BUILDER</div>
      <header className="mt-8 mb-7 md:mt-10 md:mb-8">
        <p className="mb-4 flex items-center gap-2 text-[10px] font-bold tracking-[1.4px] text-accent">
          <span className="size-1.5 rounded-full bg-accent" /> STEP 2 OF 6 · DIAGRAM REVIEW
        </p>
        <h1 className="mb-4 text-[clamp(1.875rem,3vw,2.625rem)] leading-tight font-[650] tracking-[-1.3px]">
          Review the diagram structure.
        </h1>
        <p className="max-w-2xl text-xs leading-[1.8] text-muted md:text-[13px]">
          Review the extracted steps and connections.
        </p>
      </header>

      <section className="mb-5 rounded-xl border border-line bg-surface px-5 py-4" aria-label="Diagram source">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent"><Icon name="file" width="18" height="18" /></span>
            <div className="min-w-0">
              <p className="text-[9px] tracking-wide text-muted">{sourceFile ? 'SELECTED DIAGRAM' : 'WORKFLOW'}</p>
              <p className="mt-1 text-xs font-medium break-all">{sourceFile?.name ?? result.title}</p>
              {sourceFile && <p className="mt-1 text-[10px] text-muted">{formatFileSize(sourceFile.size)} · Kept locally</p>}
            </div>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            {sourceUrl && <a href={sourceUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-accent transition-colors duration-200 hover:text-accent-hover hover:underline motion-reduce:transition-none">
              View file <Icon name="external" width="12" height="12" />
            </a>}
            <Link to={workflowRoutes.describe} className="text-muted transition-colors duration-200 hover:text-accent motion-reduce:transition-none">
              {sourceFile ? 'Change diagram' : 'Add your diagram'}
            </Link>
          </div>
        </div>
        {prompt.trim() && <details className="mt-4 border-t border-line pt-3">
          <summary className="cursor-pointer text-[11px] font-medium text-muted">Your description</summary>
          <p className="mt-2 text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere text-muted">{prompt}</p>
        </details>}
      </section>

      <section className="rounded-xl border border-line bg-surface p-5 xl:p-6" aria-labelledby="structure-heading">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 id="structure-heading" className="text-sm font-semibold">Suggested structure</h2>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">{result.title} · {result.nodes.length} nodes · {result.edges.length} edges</p>
          </div>
          {reviewNodes.length > 0 && <button type="button" onClick={() => setSelectedNodeId(reviewNodes[0].id)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-[10px] font-medium text-amber-800 transition-colors duration-200 hover:bg-amber-100 motion-reduce:transition-none">
            <Icon name="info" width="13" height="13" />{reviewNodes.length} {reviewNodes.length === 1 ? 'step needs' : 'steps need'} review
          </button>}
        </div>

        <DiagramGraph result={result} selectedNodeId={selectedNode?.id ?? null} onSelectNode={setSelectedNodeId} />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted">
          <span>Select a node to inspect · Drag to pan</span>
        </div>

        {selectedNode && <section className="mt-5 rounded-lg border border-line bg-slate-50/70 p-4" aria-label="Selected node details" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[9px] font-medium text-muted">{selectedNode.id.toUpperCase()}</span>
            <h3 className="text-xs font-semibold">{selectedNode.label}</h3>
            <NodeRoleBadge role={selectedNode.role} />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">{selectedNode.description}</p>
          {selectedNode.reviewNote && <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-amber-800">
            <Icon name="info" width="14" height="14" className="mt-0.5 shrink-0" />{selectedNode.reviewNote}
          </p>}
        </section>}
      </section>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1.15fr_1fr]">
        <ExtractedNodes nodes={result.nodes} selectedNodeId={selectedNode?.id ?? null} onSelectNode={setSelectedNodeId} />
        <ExtractedEdges nodes={result.nodes} edges={result.edges} />
      </div>

      <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
        <Link to={workflowRoutes.describe}
          className="inline-flex items-center gap-2 rounded-md border border-line bg-surface px-4 py-3 text-xs font-semibold transition-colors duration-200 hover:bg-slate-50 motion-reduce:transition-none">
          <Icon name="back" width="16" height="16" />Back
        </Link>
        <div className="flex items-center gap-4">
          <Button onClick={onContinue}>
            Confirm & continue<Icon name="arrow" width="17" height="17" />
          </Button>
        </div>
      </div>

      <footer className="mt-8 flex items-center justify-between border-t border-line pt-5 text-[8px] tracking-[1.5px] text-muted md:mt-10">
        <span>PARSE DIAGRAM</span>
        <span className="font-semibold tracking-wide text-accent">02 <span className="mx-2 text-slate-400">/</span> 06</span>
      </footer>
    </>
  )
}
