import type { SavedWorkflow, WorkflowDraft } from '../../../../shared/workflows.ts'

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]))
  return value
}
export function isWorkflowDirty(draft: WorkflowDraft, saved: SavedWorkflow | null): boolean {
  return !saved || JSON.stringify(canonical(draft)) !== JSON.stringify(canonical({ plan: saved.plan, diagram: saved.diagram, prompt: saved.prompt }))
}
