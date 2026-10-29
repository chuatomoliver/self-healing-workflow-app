export type DiagramNodeRole = 'trigger' | 'transform' | 'decision' | 'action'

// Frontend view model. Final Muse responses will be mapped into this shape.
export type DiagramNode = {
  id: string
  label: string
  role: DiagramNodeRole
  description: string
  app?: string
  reviewNote?: string
  position: { x: number; y: number }
}

export type DiagramEdge = {
  id: string
  source: string
  target: string
  label?: string
}

export type ParsedDiagram = {
  id: string
  title: string
  summary: string
  nodes: DiagramNode[]
  edges: DiagramEdge[]
}
