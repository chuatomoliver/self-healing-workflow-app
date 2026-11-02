import type { PlanWebhookTemplate, WebhookConnectionState } from '../types'
import { webhookSetupIssues } from '../../../../../shared/setup.ts'
export function WebhookStatus({ template }: { template: PlanWebhookTemplate; state?: WebhookConnectionState[string] }) {
  const configured = !webhookSetupIssues(template).length
  return <span className={`shrink-0 rounded-md px-2 py-1 text-[9px] font-medium ${configured ? 'bg-accent-soft text-accent' : 'bg-amber-50 text-amber-800'}`}>{configured ? template.configuredBy === 'muse' ? 'Configured by Muse' : 'Setup reviewed' : 'Needs setup'}</span>
}
