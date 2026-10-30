import { Button } from '../../../components/ui/Button'
import { Icon } from '../../../components/ui/Icon'
import type { PlanStep, PlanWebhookTemplate, WebhookConnectionState } from '../types'
import { WebhookStatus } from './WebhookStatus'

type PlanWebhooksProps = {
  templates: PlanWebhookTemplate[]
  steps: PlanStep[]
  connections: WebhookConnectionState
  onConnect: (templateId: string) => void
  onReview: (template: PlanWebhookTemplate) => void
}

export function PlanWebhooks({ templates, steps, connections, onConnect, onReview }: PlanWebhooksProps) {
  const connectedCount = templates.filter((template) => connections[template.id] === 'connected-demo').length

  return <section className="mt-5 rounded-xl border border-line bg-surface p-5 xl:p-6" aria-labelledby="webhooks-heading">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <h2 id="webhooks-heading" className="text-sm font-semibold">Webhook templates</h2>
      <span className="rounded-md bg-accent-soft px-2 py-1 text-[10px] font-medium text-accent">{connectedCount} of {templates.length} connected</span>
    </div>
    <div className="mt-5 grid gap-3 lg:grid-cols-3">
      {templates.map((template) => {
        const connected = connections[template.id] === 'connected-demo'
        const requiredSteps = steps.filter((step) => step.webhookTemplateId === template.id)

        return <article key={template.id} className={`flex min-w-0 flex-col rounded-lg border p-4 transition-colors duration-200 motion-reduce:transition-none ${connected ? 'border-emerald-200 bg-emerald-50/20' : 'border-line'}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[9px] font-semibold text-accent"><Icon name={template.direction === 'incoming' ? 'back' : 'arrow'} width="13" height="13" />{template.direction === 'incoming' ? 'INCOMING' : 'OUTGOING'}</span>
            <WebhookStatus state={connections[template.id]} />
          </div>
          <h3 className="mt-4 text-xs font-semibold">{template.name}</h3>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">{template.purpose}</p>
          <p className="mt-3 flex items-start gap-2 rounded-md bg-slate-50 p-2 text-[9px] leading-relaxed"><span className="font-semibold text-accent">{template.method}</span><code className="min-w-0 wrap-anywhere text-muted">{template.event}</code></p>
          <p className="mt-3 mb-4 text-[10px] leading-relaxed text-muted">Used by: {requiredSteps.map((step) => step.title).join(', ') || 'No steps assigned'}</p>
          <div className="mt-auto grid gap-2">
            <Button variant={connected ? 'secondary' : 'primary'} size="compact" disabled={connected} onClick={() => onConnect(template.id)}>
              <Icon name={connected ? 'check' : 'bolt'} width="13" height="13" />{connected ? `${template.name} connected` : `Connect ${template.name}`}
            </Button>
            <Button variant="text" size="compact" onClick={() => onReview(template)}>View {template.name} template<Icon name="arrow" width="12" height="12" /></Button>
          </div>
        </article>
      })}
    </div>
    {templates.length === 0 && <p className="py-5 text-xs text-muted">This plan does not require webhooks.</p>}
  </section>
}
