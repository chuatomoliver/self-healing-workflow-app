import { Button } from '../../../components/ui/Button'
import { Dialog } from '../../../components/ui/Dialog'
import { Icon } from '../../../components/ui/Icon'
import type { PlanWebhookTemplate, WebhookConnectionState } from '../types'
import { WebhookStatus } from './WebhookStatus'
import { webhookReviewState } from '../webhookReview'

type WebhookTemplateDialogProps = {
  template: PlanWebhookTemplate | null
  connections: WebhookConnectionState
  onConnect: (templateId: string) => void
  onClose: () => void
}

export function WebhookTemplateDialog({ template, connections, onConnect, onClose }: WebhookTemplateDialogProps) {
  const connected = template ? webhookReviewState(template, connections[template.id]) === 'connected-demo' : false
  const suggested = template?.suggestedBy === 'muse'

  return <Dialog open={template !== null} title={template ? `${template.name} template` : 'Webhook template'} onClose={onClose}>
    {template && <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[9px] font-semibold tracking-wide text-accent">{template.direction === 'incoming' ? 'INCOMING' : 'OUTGOING'} · {template.method}</span>
        <WebhookStatus template={template} state={connections[template.id]} />
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted">{template.purpose}</p>
      {suggested && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">
        <p className="font-semibold">Suggested by Muse · setup required</p>
        <p className="mt-2">{template.suggestionReason}</p>
        <ul className="mt-3 list-disc space-y-1 pl-4">
          <li>Replace the placeholder endpoint with a provisioned receiver URL.</li>
          <li>Confirm the provider's authentication and store its secret on the server.</li>
          <li>Review the proposed payload fields and mappings against the receiver contract.</li>
        </ul>
        <p className="mt-3">The endpoint and authentication below are placeholders. No registration or delivery test has run. Live webhook setup is not available yet.</p>
      </div>}
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
        {!suggested && <Button disabled={connected} onClick={() => onConnect(template.id)}><Icon name={connected ? 'check' : 'bolt'} width="14" height="14" />{connected ? `${template.name} connected` : `Connect ${template.name}`}</Button>}
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </div>
    </>}
  </Dialog>
}
