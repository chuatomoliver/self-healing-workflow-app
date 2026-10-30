import { Button } from '../../../components/ui/Button'
import { Dialog } from '../../../components/ui/Dialog'
import { Icon } from '../../../components/ui/Icon'
import type { PlanWebhookTemplate, WebhookConnectionState } from '../types'
import { WebhookStatus } from './WebhookStatus'

type WebhookTemplateDialogProps = {
  template: PlanWebhookTemplate | null
  connections: WebhookConnectionState
  onConnect: (templateId: string) => void
  onClose: () => void
}

export function WebhookTemplateDialog({ template, connections, onConnect, onClose }: WebhookTemplateDialogProps) {
  const connected = template ? connections[template.id] === 'connected-demo' : false

  return <Dialog open={template !== null} title={template ? `${template.name} template` : 'Webhook template'} onClose={onClose}>
    {template && <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[9px] font-semibold tracking-wide text-accent">{template.direction === 'incoming' ? 'INCOMING' : 'OUTGOING'} · {template.method}</span>
        <WebhookStatus state={connections[template.id]} />
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted">{template.purpose}</p>
      <h3 className="mt-5 mb-2 text-xs font-semibold">Endpoint preview</h3>
      <code className="block rounded-md border border-line bg-slate-50 p-3 text-[10px] leading-relaxed wrap-anywhere text-muted">{template.endpoint.urlTemplate}</code>

      <h3 className="mt-5 mb-2 text-xs font-semibold">Authentication reference</h3>
      <dl className="grid gap-2 rounded-md border border-line p-3 text-[10px] leading-relaxed">
        <div className="flex justify-between gap-3"><dt className="text-muted">Method</dt><dd>{template.authentication.type === 'signature' ? 'Signature verification' : 'Secret header'}</dd></div>
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3"><dt className="text-muted">Header</dt><dd className="text-right"><code className="wrap-anywhere">{template.authentication.headerName}</code></dd></div>
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3"><dt className="text-muted">Secret reference</dt><dd className="text-right"><code className="wrap-anywhere">{template.authentication.secretRef}</code></dd></div>
      </dl>

      <h3 className="mt-5 mb-2 text-xs font-semibold">Payload template</h3>
      <pre className="max-h-56 overflow-auto rounded-lg bg-slate-950 p-3 text-[10px] leading-[1.8] text-slate-200"><code>{JSON.stringify(template.payloadTemplate, null, 2)}</code></pre>
      <div className="mt-5 grid gap-2">
        <Button disabled={connected} onClick={() => onConnect(template.id)}><Icon name={connected ? 'check' : 'bolt'} width="14" height="14" />{connected ? `${template.name} connected` : `Connect ${template.name}`}</Button>
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </div>
    </>}
  </Dialog>
}
