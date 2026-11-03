import { useEffect, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { Dialog } from '../../../components/ui/Dialog'
import { setupInput } from './SetupFields'
import { listSlackConnections, setupSlackConnection } from '../api'
import { configureSlackWorkflow, slackWorkflowSteps } from '../slackSetup'
import type { WorkflowPlan } from '../types'
import type { SlackSetupResult } from '../../../../../shared/slack.ts'
import { validSlackWebhookUrl } from '../../../../../shared/slack.ts'

type Props = { plan: WorkflowPlan; onClose: () => void } & (
  { onApply: (plan: WorkflowPlan) => void; onConnected?: never } | { onApply?: never; onConnected: (connection: SlackSetupResult) => void }
)
export function SlackSetupDialog({ plan, onApply, onConnected, onClose }: Props) {
  const steps = slackWorkflowSteps(plan)
  const currentHook = plan.webhooks.find((hook) => hook.id === steps?.slack.webhookTemplateId)
  const [connections, setConnections] = useState<SlackSetupResult[]>([])
  const [selected, setSelected] = useState(currentHook?.connectionId ?? '')
  const [name, setName] = useState('Slack notifications')
  const [channel, setChannel] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [message, setMessage] = useState(steps?.message.configuration.find((setting) => /^(message(?: text)?|text)$/i.test(setting.label))?.value ?? '')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const saved = connections.find((item) => item.connection.id === selected)
  useEffect(() => {
    const controller = new AbortController()
    void listSlackConnections(controller.signal).then((items) => { if (!controller.signal.aborted) setConnections(items) })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not load Slack connections.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])
  async function submit() {
    if (!onConnected && !message.trim()) { setError('Enter the message to send.'); return }
    if (!saved && (!name.trim() || !/^#[a-zA-Z0-9_-]{1,80}$/.test(channel.trim()) || !validSlackWebhookUrl(webhookUrl.trim()))) {
      setError('Enter a connection name, a channel such as #general, and a Slack incoming webhook URL.'); return
    }
    setBusy(true); setError('')
    try {
      const result = saved ?? await setupSlackConnection({ name: name.trim(), channel: channel.trim(), webhookUrl: webhookUrl.trim() })
      setWebhookUrl('')
      if (onConnected) onConnected(result)
      else onApply(configureSlackWorkflow(plan, result, message))
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Slack setup could not be saved.') }
    finally { setBusy(false) }
  }
  return <Dialog open title="Set up Slack notifications" onClose={() => { if (!busy) onClose() }}>
    <form onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <p className="text-xs leading-relaxed text-muted">{onConnected ? 'Choose a saved Slack connection or add one for your channel.' : 'Connect Slack and set the message for this three-step workflow.'} Saving setup sends no message and uses no Meta credits.</p>
      <label className="mt-4 block text-xs font-medium">Connection<select className={setupInput} disabled={busy || loading} value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">Add a Slack webhook</option>{connections.map((item) => <option key={item.connection.id} value={item.connection.id}>{item.connection.name} · {item.channel}</option>)}</select></label>
      {saved ? <p className="mt-3 text-xs text-muted">Messages will go to {saved.channel} using this saved webhook.</p> : <>
        <label className="mt-3 block text-xs font-medium">Connection name<input className={setupInput} value={name} maxLength={200} required disabled={busy} onChange={(event) => setName(event.target.value)} /></label>
        <label className="mt-3 block text-xs font-medium">Channel selected in Slack<input className={setupInput} placeholder="#general" value={channel} maxLength={81} required disabled={busy} onChange={(event) => setChannel(event.target.value)} /></label>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">Enter the channel you chose when creating the webhook. This label does not change its destination.</p>
        <label className="mt-3 block text-xs font-medium">Slack webhook URL<input className={setupInput} type="password" autoComplete="off" spellCheck={false} placeholder="https://hooks.slack.com/services/…" value={webhookUrl} maxLength={2048} required disabled={busy} onChange={(event) => setWebhookUrl(event.target.value)} /></label>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">Stored in Windows Credential Manager. The secret URL is excluded from your saved workflow and Muse requests.</p>
        <a className="mt-2 inline-block text-[11px] text-accent underline" href="https://api.slack.com/apps" target="_blank" rel="noreferrer">Get a webhook: Your app → Incoming Webhooks → Add New Webhook to Workspace</a>
      </>}
      {!onConnected && <><label className="mt-4 block text-xs font-medium">Message<textarea className={setupInput} rows={3} value={message} maxLength={4000} required disabled={busy} placeholder="Hello team! This is a test notification." onChange={(event) => setMessage(event.target.value)} /></label>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">This updates Set Message and changes the Slack step to use the saved webhook. Connection and channel questions will be answered automatically. Save the draft afterward, then run it on the canvas.</p></>}
      {error && <p role="alert" className="mt-3 text-xs text-danger">{error}</p>}
      <div className="mt-5 flex flex-wrap gap-3"><Button type="submit" disabled={busy || loading}>{busy ? 'Saving connection…' : onConnected ? saved ? 'Use connection' : 'Save connection' : 'Apply Slack setup'}</Button><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button></div>
    </form>
  </Dialog>
}
