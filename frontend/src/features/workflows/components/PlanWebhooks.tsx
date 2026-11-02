import { Button } from '../../../components/ui/Button'
import { Icon } from '../../../components/ui/Icon'
import type { PlanStep, PlanWebhookTemplate } from '../types'
import { WebhookStatus } from './WebhookStatus'
import { webhookSetupIssues, webhookMappingsIssue } from '../../../../../shared/setup.ts'
import { WebhookDeliveryControls } from './WebhookDeliveryControls'
import type { SavedWorkflow } from '../../../../../shared/workflows.ts'

export function PlanWebhooks({ templates, steps, onReview, saved, canDeliver }: { templates: PlanWebhookTemplate[]; steps: PlanStep[]; onReview: (template: PlanWebhookTemplate) => void; saved: SavedWorkflow | null; canDeliver: boolean }) {
  const configured = templates.filter((template) => !webhookSetupIssues(template).length).length
  return <section className="mt-5 rounded-xl border border-line bg-surface p-5 xl:p-6" aria-labelledby="webhooks-heading">
    <div className="flex flex-wrap items-start justify-between gap-3"><h2 id="webhooks-heading" className="text-sm font-semibold">Webhook templates</h2><span className="rounded-md bg-accent-soft px-2 py-1 text-[10px] font-medium text-accent">{configured} of {templates.length} configured</span></div>
    <div className="mt-5 grid gap-3 lg:grid-cols-3">{templates.map((template) => {
      const reviewed = !webhookSetupIssues(template).length
      return <article key={template.id} className={`flex min-w-0 flex-col rounded-lg border p-4 transition-colors duration-200 motion-reduce:transition-none ${reviewed ? 'border-emerald-200 bg-emerald-50/20' : 'border-line'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-1.5 text-[9px] font-semibold text-accent"><Icon name={template.direction === 'incoming' ? 'back' : 'arrow'} width="13" height="13" />{template.direction === 'incoming' ? 'INCOMING' : 'OUTGOING'}</span><WebhookStatus template={template} /></div>
        <h3 className="mt-4 text-xs font-semibold wrap-anywhere">{template.name}</h3>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">{template.purpose}</p>
        <p className="mt-3 flex items-start gap-2 rounded-md bg-slate-50 p-2 text-[9px] leading-relaxed"><span className="font-semibold text-accent">{template.method}</span><code className="min-w-0 wrap-anywhere text-muted">{template.event}</code></p>
        <p className="mt-3 mb-4 text-[10px] leading-relaxed text-muted">Used by: {steps.filter((step) => step.webhookTemplateId === template.id).map((step) => step.title).join(', ') || 'No steps assigned'}</p>
        <div className="mt-auto grid gap-2"><Button variant={reviewed ? 'secondary' : 'primary'} size="compact" onClick={() => onReview(template)}><Icon name={reviewed ? 'check' : 'bolt'} width="13" height="13" />{reviewed ? 'View' : 'Configure'} {template.name}</Button>
          <WebhookDeliveryControls compact template={template} workflowId={saved?.id} version={saved?.version} enabled={canDeliver && reviewed && steps.some((step) => step.webhookTemplateId === template.id && !webhookMappingsIssue(step, template))} />
          <details className="text-[10px] text-muted"><summary className="cursor-pointer text-accent">{template.suggestedBy === 'muse' ? 'Suggested by Muse' : 'Why this webhook?'}</summary><p className="mt-2 leading-relaxed">{template.suggestionReason || 'Review this connection as part of the workflow setup.'}</p></details>
        </div>
      </article>
    })}</div>
    {!templates.length && <p className="py-5 text-xs text-muted">This plan does not require webhooks.</p>}
  </section>
}
