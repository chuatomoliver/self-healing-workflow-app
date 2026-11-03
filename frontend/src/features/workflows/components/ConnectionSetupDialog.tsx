import { useEffect, useState } from 'react'
import type { WebhookConnection, WebhookConnectionRequest } from '../../../../../shared/connections.ts'
import type { PlanWebhookTemplate } from '../types'
import { Button } from '../../../components/ui/Button'
import { Dialog } from '../../../components/ui/Dialog'
import { setupInput } from './SetupFields'
import { listConfiguredConnections, setupWebhookConnection } from '../api'

export function ConnectionSetupDialog({ template, onConnected, onClose }: { template: PlanWebhookTemplate; onConnected: (connection: WebhookConnection) => void; onClose: () => void }) {
  const [connections, setConnections] = useState<WebhookConnection[]>([])
  const [selected, setSelected] = useState(template.connectionId ?? '')
  const [name, setName] = useState(template.name)
  const [url, setUrl] = useState('')
  const [mode, setMode] = useState<WebhookConnectionRequest['mode']>('url')
  const [headerName, setHeaderName] = useState('Authorization')
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const saved = connections.find((connection) => connection.id === selected)
  useEffect(() => {
    const controller = new AbortController()
    void listConfiguredConnections(controller.signal).then((items) => { if (!controller.signal.aborted) setConnections(items) })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not load connections.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])
  async function submit() {
    setBusy(true); setError('')
    try {
      const connection = saved ?? await setupWebhookConnection({ name: name.trim(), url: url.trim(), mode, headerName: mode === 'url' ? '' : headerName.trim(), secret: mode === 'url' ? '' : secret })
      setUrl(''); setSecret(''); setSelected(connection.id)
      setConnections((items) => [...items.filter((item) => item.id !== connection.id), connection])
      onConnected(connection)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Connection setup failed.') }
    finally { setBusy(false) }
  }
  return <Dialog open title={`Connect ${template.name}`} onClose={() => { if (!busy) onClose() }}>
    <form onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <p className="text-xs leading-relaxed text-muted">Connect an outgoing HTTPS webhook, including Slack, n8n, or another service. Saving sends no message and uses no AI credits.</p>
      <label className="mt-4 block text-xs font-medium">Connection<select className={setupInput} disabled={busy || loading} value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">Add a webhook connection</option>{connections.map((connection) => <option key={connection.id} value={connection.id}>{connection.name}</option>)}</select></label>
      {!saved && <>
        <label className="mt-3 block text-xs font-medium">Connection name<input className={setupInput} required maxLength={200} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} /></label>
        <label className="mt-3 block text-xs font-medium">Webhook URL<input className={setupInput} type="password" autoComplete="off" spellCheck={false} required maxLength={2048} value={url} disabled={busy} onChange={(event) => setUrl(event.target.value)} /></label>
        <label className="mt-3 block text-xs font-medium">Authentication<select className={setupInput} value={mode} disabled={busy} onChange={(event) => setMode(event.target.value as WebhookConnectionRequest['mode'])}><option value="url">Webhook URL only (Slack and similar services)</option><option value="secret-header">Secret header / bearer token</option><option value="signature">HMAC-SHA256 signature</option></select></label>
        {mode !== 'url' && <>
          <label className="mt-3 block text-xs font-medium">Header name<input className={setupInput} required maxLength={100} value={headerName} disabled={busy} onChange={(event) => setHeaderName(event.target.value)} /></label>
          <label className="mt-3 block text-xs font-medium">{mode === 'signature' ? 'Signing secret' : 'Header value (include Bearer if required)'}<input className={setupInput} type="password" autoComplete="off" required maxLength={1024} value={secret} disabled={busy} onChange={(event) => setSecret(event.target.value)} /></label>
        </>}
      </>}
      <p className="mt-3 text-[11px] leading-relaxed text-muted">The full URL and credentials stay in private backend storage. Existing payload mappings are preserved. A Slack webhook delivers to the channel selected when it was created.</p>
      {error && <p role="alert" className="mt-3 text-xs text-danger">{error}</p>}
      <div className="mt-5 flex gap-3"><Button type="submit" disabled={busy || loading}>{busy ? 'Saving…' : saved ? 'Use connection' : 'Save connection'}</Button><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button></div>
    </form>
  </Dialog>
}
