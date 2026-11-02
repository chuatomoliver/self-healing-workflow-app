import type { PlanWebhookTemplate, WebhookConnectionState } from '../types'
import { webhookReviewState } from '../webhookReview'

export function WebhookStatus({ state, template }: { state: WebhookConnectionState[string]; template: PlanWebhookTemplate }) {
  const status = webhookReviewState(template, state)
  return <span className={`shrink-0 rounded-md px-2 py-1 text-[9px] font-medium ${status === 'connected-demo' ? 'bg-emerald-50 text-emerald-800' : status === 'needs-setup' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-muted'}`}>
    {status === 'connected-demo' ? 'Connected' : status === 'needs-setup' ? 'Needs setup' : 'Suggested'}
  </span>
}
