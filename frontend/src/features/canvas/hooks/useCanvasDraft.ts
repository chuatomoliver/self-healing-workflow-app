import { useState } from 'react'
import type { WorkflowPlan } from '../../workflows/types'
import type { CanvasPosition, CanvasPositions } from '../types'

export function useCanvasDraft(plan: WorkflowPlan, initialPositions: CanvasPositions) {
  const [positions, setPositions] = useState(initialPositions)
  const [titles, setTitles] = useState<Record<string, string>>({})
  const steps = plan.steps.map((step) => ({ ...step, title: titles[step.id] ?? step.title }))

  function moveStep(id: string, position: CanvasPosition) {
    setPositions((current) => ({ ...current, [id]: position }))
  }

  function renameStep(id: string, title: string) {
    const trimmed = title.trim()
    if (trimmed && trimmed.length <= 80 && plan.steps.some((step) => step.id === id)) {
      setTitles((current) => ({ ...current, [id]: trimmed }))
    }
  }

  return { steps, positions, moveStep, renameStep, resetLayout: () => setPositions(initialPositions) }
}
