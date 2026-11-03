import { useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { Dialog } from '../../../components/ui/Dialog'
import type { PlanWebhookTemplate } from '../types'
import { webhookAddressIssue, webhookAuthenticationIssue, webhookEndpointIssue, webhookPayloadIssue } from '../../../../../shared/setup.ts'
import { PairRows, setupInput } from './SetupFields'

export function WebhookTemplateDialog({ template, onUpdate, onClose }: { template: PlanWebhookTemplate; onUpdate: (template: PlanWebhookTemplate) => void; onClose: () => void }) {
  const [value, setValue] = useState<PlanWebhookTemplate>(() => structuredClone(template))
  const [rows, setRows] = useState(() => Object.entries(template.payloadTemplate).map(([first, second]) => ({ first, second })))
  const [error, setError] = useState('')
  const candidate = { ...value, payloadTemplate: Object.fromEntries(rows.map((row) => [row.first, row.second])) }
  const endpointIssue = webhookEndpointIssue(candidate)
  const authIssue = webhookAuthenticationIssue(candidate)
  const payloadIssue = webhookPayloadIssue(candidate)
  const setup = value.setup ?? { endpointReviewed: false, authenticationReviewed: false, payloadReviewed: false }
  const savedDestination = template.authentication.type === 'slack-webhook' || template.authentication.type === 'stored-webhook'
  function update(patch: Partial<PlanWebhookTemplate>) {
    setValue((current) => ({ ...current, ...patch, configuredBy: undefined,
      connectionId: patch.endpoint || patch.authentication ? undefined : current.connectionId,
      setup: { endpointReviewed: patch.endpoint ? false : current.setup?.endpointReviewed ?? false,
        authenticationReviewed: patch.authentication ? false : current.setup?.authenticationReviewed ?? false, payloadReviewed: false } }))
    setError('')
  }
  return <Dialog open title={`Set up ${template.name}`} onClose={onClose}>
    <form onSubmit={(event) => {
      event.preventDefault()
      const addressIssue = webhookAddressIssue(value.endpoint.urlTemplate)
      if (!value.name.trim() || !value.event.trim() || addressIssue || authIssue || payloadIssue || new Set(rows.map((row) => row.first)).size !== rows.length) {
        setError(addressIssue ?? authIssue ?? payloadIssue ?? 'Complete the name and event, and use unique payload field names.'); return
      }
      onUpdate(candidate)
    }}>
      <p className="text-[11px] leading-relaxed text-muted">{template.suggestedBy === 'muse' ? 'Suggested by Muse. ' : ''}{template.suggestionReason}</p>
      {template.configuredBy === 'muse' && <p className="mt-3 text-[11px] leading-relaxed text-accent">Muse configured this webhook using the saved {template.connectionId} connection. Individual review checkboxes are optional. Editing settings switches to manual setup.</p>}
      <p className="mt-3 rounded-lg bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">This form saves setup to your draft. It does not contact the destination, register a webhook, or test credentials.</p>
      <label className="mt-4 block text-[11px] font-medium">Webhook name<input className={setupInput} value={value.name} maxLength={200} required onChange={(event) => update({ name: event.target.value })} /></label>
      <p className="mt-3 text-[10px] font-medium uppercase text-accent">{value.direction} · {value.method}</p>
      <label className="mt-3 block text-[11px] font-medium">Event name<input className={setupInput} value={value.event} maxLength={200} required onChange={(event) => update({ event: event.target.value })} /></label>
      <label className="mt-3 block text-[11px] font-medium">Purpose<textarea className={setupInput} rows={2} value={value.purpose} maxLength={4000} onChange={(event) => update({ purpose: event.target.value })} /></label>
      <label className="mt-4 block text-[11px] font-medium">{value.direction === 'incoming' ? 'Planned receiving address' : 'Destination address'}<input className={setupInput} type="url" value={value.endpoint.urlTemplate} disabled={savedDestination} maxLength={2048} required onChange={(event) => update({ endpoint: { ...value.endpoint, urlTemplate: event.target.value } })} /></label>
      {value.direction === 'outgoing' && <p className="mt-2 text-[10px] leading-relaxed text-muted">Use Set up connection on the webhook card for the full destination URL and credentials. This form reviews the event and payload.</p>}
      {endpointIssue && <p className="mt-2 text-[10px] text-amber-800">{endpointIssue}</p>}
      <label className="mt-2 flex items-start gap-2 text-[11px]"><input type="checkbox" disabled={!!endpointIssue} checked={setup.endpointReviewed} onChange={(event) => setValue((current) => ({ ...current, setup: { ...setup, endpointReviewed: event.target.checked } }))} />I reviewed this endpoint address.</label>
      <fieldset className="mt-5 border-t border-line pt-4"><legend className="text-xs font-semibold">Authentication reference</legend>
        {savedDestination ? <p className="mt-2 text-[11px] text-muted">Authentication is managed by the saved connection.</p> : <>
        <label className="mt-2 block text-[11px]">Method<select className={setupInput} value={value.authentication.type} onChange={(event) => update({ authentication: { ...value.authentication, type: event.target.value as 'signature' | 'secret-header' } })}><option value="signature">Signature verification</option><option value="secret-header">Secret header</option></select></label>
        <label className="mt-3 block text-[11px]">Header name<input className={setupInput} value={value.authentication.headerName} maxLength={100} onChange={(event) => update({ authentication: { ...value.authentication, headerName: event.target.value } })} /></label>
        <label className="mt-3 block text-[11px]">Credential reference name<input className={setupInput} value={value.authentication.secretRef} maxLength={120} onChange={(event) => update({ authentication: { ...value.authentication, secretRef: event.target.value } })} /></label>
        <p className="mt-2 text-[10px] leading-relaxed text-muted">Use a name such as sales_webhook_secret. Do not paste an API key or password here. Actual credential storage and verification belong to connection setup.</p>
        </>}
        {authIssue && <p className="mt-2 text-[10px] text-amber-800">{authIssue}</p>}
        <label className="mt-2 flex items-start gap-2 text-[11px]"><input type="checkbox" disabled={!!authIssue} checked={setup.authenticationReviewed} onChange={(event) => setValue((current) => ({ ...current, setup: { ...setup, authenticationReviewed: event.target.checked } }))} />I reviewed the required authentication and reference name.</label>
      </fieldset>
      <PairRows title="Payload" labels={['Payload field name', 'Value reference, for example {{order.id}}']} rows={rows} maxRows={20} maxFirstLength={100} maxSecondLength={204} onChange={(next) => { setRows(next); update({}) }} />
      {payloadIssue && <p className="mt-2 text-[10px] text-amber-800">{payloadIssue}</p>}
      <label className="mt-2 flex items-start gap-2 text-[11px]"><input type="checkbox" disabled={!!payloadIssue} checked={setup.payloadReviewed} onChange={(event) => setValue((current) => ({ ...current, setup: { ...setup, payloadReviewed: event.target.checked } }))} />I reviewed the payload fields and their sources.</label>
      <p className="mt-4 text-[10px] leading-relaxed text-muted">Reviewed configuration is not a tested connection. Select Save draft in Plan Workflow to keep these changes after closing the app.</p>
      {error && <p role="alert" className="mt-3 text-xs text-danger">{error}</p>}
      <div className="mt-5 flex gap-3"><Button type="submit">Apply to draft</Button><Button variant="secondary" onClick={onClose}>Cancel</Button></div>
    </form>
  </Dialog>
}
