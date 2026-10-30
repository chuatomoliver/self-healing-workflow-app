import type { WebhookConnectionState } from '../types'

export function WebhookStatus({ state }: { state: WebhookConnectionState[string] }) {
  return <span className={`shrink-0 rounded-md px-2 py-1 text-[9px] font-medium ${state === 'connected-demo' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-muted'}`}>
    {state === 'connected-demo' ? 'Connected' : 'Suggested'}
  </span>
}
