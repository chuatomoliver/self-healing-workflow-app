import { Button } from '../../../components/ui/Button'
import type { PlanStep, PlanWebhookTemplate } from '../types'
import { WebhookStatus } from './WebhookStatus'
import { webhookSetupIssues } from '../../../../../shared/setup.ts'

export function PlanWebhooks({ templates, steps, onReview }: { templates: PlanWebhookTemplate[]; steps: PlanStep[]; onReview: (template: PlanWebhookTemplate) => void }) {
  const configured = templates.filter((template) => !webhookSetupIssues(template).length).length
  return <section className="mt-5 rounded-xl border border-line bg-surface p-5 xl:p-6" aria-labelledby="webhooks-heading">
    <div className="flex flex-wrap items-start justify-between gap-3"><h2 id="webhooks-heading" className="text-sm font-semibold">Webhook setup</h2><span className="rounded-md bg-accent-soft px-2 py-1 text-[10px] text-accent">{configured} of {templates.length} reviewed</span></div>
    <div className="mt-5 grid gap-3 lg:grid-cols-2">{templates.map((template) => <article key={template.id} className="min-w-0 rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[9px] font-semibold uppercase text-accent">{template.direction} · {template.method}</span><WebhookStatus template={template} /></div>
      <h3 className="mt-3 text-xs font-semibold wrap-anywhere">{template.name}</h3>
      {template.suggestedBy === 'muse' && <p className="mt-2 text-[9px] font-medium text-accent">Suggested by Muse</p>}
      <p className="mt-2 text-[11px] leading-relaxed text-muted">{template.purpose}</p>
      <p className="mt-2 text-[10px] leading-relaxed text-muted">{template.suggestionReason}</p>
      <p className="mt-3 text-[10px] text-muted">Event: <code className="wrap-anywhere">{template.event}</code></p>
      <p className="mt-2 text-[10px] text-muted">Used by: {steps.filter((step) => step.webhookTemplateId === template.id).map((step) => step.title).join(', ') || 'No step assigned'}</p>
      <Button size="compact" className="mt-4" onClick={() => onReview(template)}>Configure {template.name}</Button>
    </article>)}</div>
    {!templates.length ? <p className="py-5 text-xs text-muted">No webhooks are proposed for this workflow. Review the step operations for other connection requirements.</p> : <p className="mt-4 text-[11px] leading-relaxed text-muted">Setup is saved as configuration only. No webhook has been registered or tested.</p>}
  </section>
}
