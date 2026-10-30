import type { CanvasStepStatus } from './types'

export const canvasStepStates: Record<CanvasStepStatus, { label: string; colors: string; border: string }> = {
  idle: { label: 'Not run', colors: 'bg-slate-100 text-muted', border: 'border-line' },
  running: { label: 'Running', colors: 'bg-accent-soft text-accent', border: 'border-accent' },
  succeeded: { label: 'Succeeded', colors: 'bg-emerald-50 text-emerald-800', border: 'border-emerald-300' },
  failed: { label: 'Failed', colors: 'bg-red-50 text-danger', border: 'border-red-300' },
  skipped: { label: 'Skipped branch', colors: 'bg-slate-100 text-muted', border: 'border-line' },
  stopped: { label: 'Stopped', colors: 'bg-amber-50 text-amber-800', border: 'border-amber-300' },
}
