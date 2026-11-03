import { useEffect, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { Dialog } from '../../../components/ui/Dialog'
import { WorkflowPageHeading, WorkflowPageFooter } from '../../../components/ui/WorkflowPageHeading'
import type { SlackSetupResult } from '../../../../../shared/slack.ts'
import type { PlanWorkflowPageProps } from '../pages/PlanWorkflowPage'
import { listSlackConnections } from '../api'
import { configureSlackWorkflow, selectSlackConnection, setSlackMessage, slackMessageText } from '../slackSetup'
import { SlackSetupDialog } from './SlackSetupDialog'
import { setupInput } from './SetupFields'
import { PlanDraftActions } from './PlanDraftActions'
import { PlanWebhooks } from './PlanWebhooks'

export function SlackMessagePlan({ plan, storage, saved, canDeliver, onChangePlan, onContinue, onDetails, planning }: PlanWorkflowPageProps & { onDetails: () => void }) {
  const [connections, setConnections] = useState<SlackSetupResult[]>([])
  const [loading, setLoading] = useState(true)
  const [connectionError, setConnectionError] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [managingDraft, setManagingDraft] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [chosenConnection, setChosenConnection] = useState<string | null>(null)
  const message = slackMessageText(plan)
  const connection = chosenConnection ? connections.find((item) => item.connection.id === chosenConnection) ?? null : selectSlackConnection(plan, connections)
  const busy = planning
  useEffect(() => {
    const controller = new AbortController()
    void listSlackConnections(controller.signal).then((items) => {
      if (!controller.signal.aborted) { setConnections(items); setConnectionError('') }
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setConnectionError(cause instanceof Error ? cause.message : 'Could not load your Slack connection.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [refresh])
  function manageDraft() {
    if (connection && message.trim()) onChangePlan(configureSlackWorkflow(plan, connection, message), '')
    setManagingDraft(true)
  }
  return <>
    <WorkflowPageHeading step={3} stage="WORKFLOW PLANNING" title="What would you like to say?" description="Write your Slack message. The workflow setup is handled automatically." />
    <section className="rounded-xl border border-line bg-surface p-5 sm:p-7 xl:p-8" aria-labelledby="slack-message-heading" aria-busy={loading || busy}>
      <label id="slack-message-heading" htmlFor="slack-message" className="block text-sm font-semibold">Your message</label>
      <textarea id="slack-message" className={`${setupInput} mt-4 min-h-48 resize-y text-sm leading-relaxed`} rows={7} value={message} maxLength={4000} disabled={busy}
        placeholder="Write the message you want to send…" onChange={(event) => {
          const text = event.target.value
          onChangePlan(connection && text.trim() ? configureSlackWorkflow(plan, connection, text) : setSlackMessage(plan, text), '')
        }} />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[11px] text-muted">
        <span>{loading ? 'Checking saved connections…' : connection ? `To ${connection.channel}` : connectionError ? 'Connection availability could not be checked.' : 'Slack delivery is identified in the webhook suggestions below.'}</span>
        <span>{message.length.toLocaleString()} / 4,000</span>
      </div>
      {!loading && !connectionError && <Button variant="text" size="inline" className="mt-2" disabled={busy} onClick={() => setConnecting(true)}>{connection ? 'Change channel' : 'Connection options'}</Button>}
      {connectionError && <div className="mt-4"><p role="alert" className="text-xs text-danger">{connectionError}</p><Button variant="text" size="inline" className="mt-2" disabled={loading} onClick={() => { setLoading(true); setRefresh((value) => value + 1) }}>Try connection again</Button></div>}
      <div className="mt-6 border-t border-line pt-5">
        <p className="text-[11px] text-muted">Your message will be sent when you run the workflow.</p>
      </div>
    </section>
    <PlanWebhooks templates={plan.webhooks} steps={plan.steps} />
    <div className="mt-4 flex justify-end"><Button variant="text" size="inline" disabled={busy} onClick={onDetails}>Workflow details</Button></div>
    <PlanDraftActions saved={saved} currentSaved={canDeliver} disabled={busy || loading} onManage={manageDraft} onContinue={onContinue} />
    <WorkflowPageFooter step={3} label="PLAN WORKFLOW" />
    {managingDraft && <Dialog open title="Save & manage drafts" onClose={() => setManagingDraft(false)}>{storage}</Dialog>}
    {connecting && <SlackSetupDialog plan={plan} onClose={() => setConnecting(false)} onConnected={(result) => {
      setConnections((items) => [...items.filter((item) => item.connection.id !== result.connection.id), result])
      setChosenConnection(result.connection.id); setConnecting(false)
      if (message.trim()) onChangePlan(configureSlackWorkflow(plan, result, message), '')
    }} />}
  </>
}
