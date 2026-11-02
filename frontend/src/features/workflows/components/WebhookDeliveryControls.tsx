import { useEffect, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { listDeliveries } from '../deliveryApi'
import { WebhookDeliveryDialog } from './WebhookDeliveryDialog'
import type { PlanWebhookTemplate } from '../types'
import type { WebhookDelivery } from '../../../../../shared/deliveries.ts'

export function WebhookDeliveryControls({ template, workflowId, version, enabled, compact = false }: { template: PlanWebhookTemplate; workflowId?: string; version?: number; enabled: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const [latest, setLatest] = useState<WebhookDelivery | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!workflowId || !version || template.direction !== 'outgoing') return
    const controller = new AbortController()
    listDeliveries(workflowId, template.id, controller.signal).then((items) => { if (!controller.signal.aborted) { setLatest(items[0] ?? null); setError('') } })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'History could not be loaded.') })
    return () => controller.abort()
  }, [workflowId, version, template.id, template.direction, revision])
  if (template.direction !== 'outgoing') return <p className="mt-3 text-[10px] text-muted">Incoming event reception is still being built.</p>
  return <div className={compact ? 'grid gap-2' : 'mt-3 border-t border-line pt-3'}>
    {latest ? <p className="text-[10px] text-muted">Last test: {latest.status === 'succeeded' ? 'accepted' : latest.status === 'failed' ? 'rejected' : latest.status === 'unknown' ? 'outcome unknown' : 'pending or interrupted'}{latest.httpStatus ? ` · HTTP ${latest.httpStatus}` : ''} · draft v{latest.workflowVersion}</p> : !compact && <p className="text-[10px] text-muted">{workflowId ? 'No saved delivery results loaded.' : 'Save this draft to enable delivery testing.'}</p>}
    {error && <p className="mt-2 text-[10px] text-danger">{error}</p>}
    <Button size="compact" variant={compact ? 'text' : 'secondary'} className={compact ? '' : 'mt-3'} disabled={!enabled || !workflowId || !version} title={!enabled ? 'Complete webhook review and save all changes before sending.' : undefined} onClick={() => setOpen(true)}>Test delivery for {template.name}</Button>
    {!compact && !enabled && workflowId && <p className="mt-2 text-[10px] text-muted">Complete webhook review and save all changes before sending.</p>}
    {open && workflowId && version && <WebhookDeliveryDialog template={template} workflowId={workflowId} version={version} onClose={() => { setOpen(false); setRevision((value) => value + 1) }} />}
  </div>
}
