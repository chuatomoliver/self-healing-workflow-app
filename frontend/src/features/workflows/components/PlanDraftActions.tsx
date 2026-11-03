import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { workflowRoutes } from '../../../app/navigation'
import { Button } from '../../../components/ui/Button'
import { Icon } from '../../../components/ui/Icon'
import type { SavedWorkflow } from '../../../../../shared/workflows.ts'

export function PlanDraftActions({ saved, currentSaved, disabled, onManage, onContinue, children }: {
  saved: SavedWorkflow | null; currentSaved: boolean; disabled: boolean
  onManage: () => void; onContinue: () => void; children?: ReactNode
}) {
  const canBuild = !!saved && currentSaved && !disabled
  return <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
    <Link to={workflowRoutes.parse} className="inline-flex items-center gap-2 rounded-md border border-line bg-surface px-4 py-3 text-xs font-semibold hover:bg-slate-50"><Icon name="back" width="16" height="16" />Back to diagram</Link>
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap gap-3">{children}<Button variant="secondary" disabled={disabled} onClick={onManage}>Save & manage drafts</Button><Button disabled={!canBuild} onClick={() => { if (canBuild) onContinue() }}>Build on canvas<Icon name="arrow" width="17" height="17" /></Button></div>
      <p role="status" aria-live="polite" className="text-[11px] text-muted">{saved && currentSaved ? `Version ${saved.version} saved.` : 'Save your latest changes to enable Build on canvas.'}</p>
    </div>
  </div>
}
