import { useEffect, useRef, useState } from 'react'
import { Dialog } from '../../../components/ui/Dialog'
import { Button } from '../../../components/ui/Button'
import { setupInput } from './SetupFields'
import { deliverTestWebhook, DeliveryRequestError, listDeliveries } from '../deliveryApi'
import type { PlanWebhookTemplate } from '../types'
import type { WebhookDelivery } from '../../../../../shared/deliveries.ts'

export function WebhookDeliveryDialog({ template, workflowId, version, onClose }: { template: PlanWebhookTemplate; workflowId: string; version: number; onClose: () => void }) {
  const [sample, setSample] = useState('{}')
  const [history, setHistory] = useState<WebhookDelivery[]>([])
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [uncertain, setUncertain] = useState(false)
  const inFlight = useRef(false)
  const pendingId = useRef<string | null>(null)
  async function refresh(signal: AbortSignal) {
    try { const items = await listDeliveries(workflowId, template.id, signal); if (!signal.aborted) { setHistory(items); setError('') } }
    catch (cause) { if (!signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load delivery history.') }
    finally { if (!signal.aborted) setLoading(false) }
  }
  useEffect(() => {
    const controller = new AbortController()
    listDeliveries(workflowId, template.id, controller.signal).then((items) => {
      if (!controller.signal.aborted) { setHistory(items); setError(''); setLoading(false) }
    }).catch((cause) => {
      if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : 'Could not load history.'); setLoading(false) }
    })
    return () => controller.abort()
  }, [workflowId, template.id])
  async function send() {
    if (inFlight.current) return
    let sampleData: Record<string, unknown>
    try {
      sampleData = JSON.parse(sample)
      if (!sampleData || typeof sampleData !== 'object' || Array.isArray(sampleData)) throw new Error()
    } catch { setError('Enter a JSON object containing the source fields shown below.'); return }
    inFlight.current = true; setSending(true); setError('')
    pendingId.current ??= crypto.randomUUID()
    try {
      const delivery = await deliverTestWebhook(workflowId, template.id, { requestId: pendingId.current, expectedVersion: version, sampleData })
      setHistory((current) => [delivery, ...current.filter((item) => item.id !== delivery.id)].slice(0, 20))
      // Pending/unknown outcomes keep their ID so repeating the request cannot resend it.
      if (['succeeded', 'failed'].includes(delivery.status)) pendingId.current = null
    } catch (cause) { if (cause instanceof DeliveryRequestError && !cause.uncertain) pendingId.current = null; setError(cause instanceof Error ? cause.message : 'Delivery could not finish. Check history.') }
    finally { inFlight.current = false; setUncertain(pendingId.current !== null); setSending(false) }
  }
  return <Dialog open title={`Test delivery to ${template.name}`} onClose={() => { if (!sending) onClose() }}>
    <p className="text-xs leading-relaxed text-muted">Send real test data using saved draft version {version}. This contacts the destination below and uses no Muse credits.</p>
    <p className="mt-3 break-all rounded-lg bg-slate-50 p-3 text-xs"><strong>Destination: </strong>{template.endpoint.urlTemplate}</p>
    <p className="mt-3 text-[11px] text-muted">Source fields needed: {Object.values(template.payloadTemplate).join(', ')}</p>
    <label className="mt-4 block text-xs font-medium">Test source data (JSON)<textarea className={`${setupInput} font-mono`} rows={6} maxLength={20000} value={sample} disabled={sending || uncertain} onChange={(event) => setSample(event.target.value)} /></label>
    <p className="mt-2 text-[10px] text-muted">Enter sample values for the mapped fields, for example {`{"order":{"id":"test-order-1"}}`}. Credentials are loaded privately by the backend.</p>
    <div className="mt-4 flex flex-wrap gap-3"><Button disabled={sending || uncertain} onClick={() => { void send() }}>{sending ? 'Sending webhook…' : 'Send test webhook'}</Button><Button variant="secondary" disabled={sending || loading} onClick={() => { setLoading(true); void refresh(new AbortController().signal) }}>Refresh history</Button></div>
    {error && <p role="alert" className="mt-3 text-xs text-danger">{error}</p>}
    {uncertain && !sending && <p className="mt-3 text-xs text-amber-800">The previous outcome is uncertain. Check history and the receiver before closing this dialog or starting another delivery.</p>}
    <section className="mt-6 border-t border-line pt-4" aria-live="polite"><h3 className="text-xs font-semibold">Recent delivery results</h3>{loading && <p className="mt-2 text-xs text-muted">Loading history…</p>}
      {!loading && !history.length && <p className="mt-3 text-xs text-muted">No delivery attempts saved yet.</p>}
      {history.map((item) => <article key={item.id} className="mt-3 rounded-lg border border-line p-3 text-[11px]">
        <p className="font-semibold">{item.status === 'succeeded' ? 'Receiver accepted the webhook' : item.status === 'failed' ? 'Receiver rejected the webhook' : item.status === 'unknown' ? 'Delivery outcome unknown' : 'Pending or interrupted delivery'}</p>
        <p className="mt-1 text-muted">{item.httpStatus ? `HTTP ${item.httpStatus} · ` : ''}{item.durationMs !== null ? `${item.durationMs} ms · ` : ''}Draft v{item.workflowVersion} · {new Date(item.createdAt).toLocaleString()}</p>
        {item.errorCode && <p className="mt-1 text-muted">{item.errorCode === 'TIMEOUT' ? 'The receiver did not answer before the timeout. It may have processed the event.' : item.errorCode === 'NETWORK_ERROR' ? 'The connection ended without a result. Check the receiver before another send.' : 'The receiver returned a non-success HTTP status. Redirects are not followed.'}</p>}
        <p className="mt-1 break-all text-[10px] text-muted">Delivery ID: {item.id}</p>
      </article>)}
    </section><Button variant="secondary" className="mt-5" disabled={sending} onClick={onClose}>Close</Button>
  </Dialog>
}
