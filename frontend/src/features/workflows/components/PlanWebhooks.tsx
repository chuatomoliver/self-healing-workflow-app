import { Button } from '../../../components/ui/Button'
import { Icon } from '../../../components/ui/Icon'
import type { PlanStep, PlanWebhookTemplate } from '../types'
import { webhookSetupIssues, webhookMappingsIssue } from '../../../../../shared/setup.ts'
import { WebhookDeliveryControls } from './WebhookDeliveryControls'
import type { SavedWorkflow } from '../../../../../shared/workflows.ts'

export function PlanWebhooks({ templates, steps, onReview, onConnect, connectingDisabled = false, saved = null, canDeliver = false }: { templates: PlanWebhookTemplate[]; steps: PlanStep[]; onReview?: (template: PlanWebhookTemplate) => void; onConnect?: (template: PlanWebhookTemplate) => void; connectingDisabled?: boolean; saved?: SavedWorkflow | null; canDeliver?: boolean }) {
  const configured = templates.filter((template) => !webhookSetupIssues(template).length).length
  return <section className="mt-5 rounded-xl border border-line bg-surface p-5 xl:p-6" aria-labelledby="webhooks-heading">
    <div className="flex flex-wrap items-start justify-between gap-3"><h2 id="webhooks-heading" className="text-sm font-semibold">Necessary webhooks</h2><span className="rounded-md bg-accent-soft px-2 py-1 text-[10px] font-medium text-accent">{templates.length} identified{configured ? ` · ${configured} connection${configured === 1 ? '' : 's'} available` : ''}</span></div>
    <p className="mt-3 text-[11px] leading-relaxed text-muted">Muse identifies where this workflow needs to send or receive data. URLs and credentials are not needed to review or save these suggestions.</p>
    <div className="mt-5 grid gap-3 lg:grid-cols-3">{templates.map((template) => {
      const reviewed = !webhookSetupIssues(template).length
      return <article key={template.id} className={`flex min-w-0 flex-col rounded-lg border p-4 transition-colors duration-200 motion-reduce:transition-none ${reviewed ? 'border-emerald-200 bg-emerald-50/20' : 'border-line'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-1.5 text-[9px] font-semibold text-accent"><Icon name={template.direction === 'incoming' ? 'back' : 'arrow'} width="13" height="13" />{template.direction === 'incoming' ? 'RECEIVES EVENTS' : 'SENDS DATA'}</span><span className="rounded-md bg-accent-soft px-2 py-1 text-[9px] font-medium text-accent">{reviewed ? template.connectionId ? 'Saved connection available' : 'Connection reviewed' : template.suggestedBy === 'muse' ? 'Suggested by Muse' : 'Identified'}</span></div>
        <h3 className="mt-4 text-xs font-semibold wrap-anywhere">{template.name}</h3>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">{template.purpose}</p>
        <p className="mt-3 text-[11px] leading-relaxed text-muted"><strong className="font-medium text-ink">Why it is needed: </strong>{template.suggestionReason || template.purpose}</p>
        <div className="mt-4"><h4 className="text-[10px] font-semibold">Data passed</h4><ul className="mt-2 flex flex-wrap gap-1.5">{Object.keys(template.payloadTemplate).map((name) => <li key={name} className="max-w-full rounded-md bg-slate-100 px-2 py-1 text-[10px] wrap-anywhere text-muted">{name}</li>)}</ul></div>
        <p className="mt-3 mb-4 text-[10px] leading-relaxed text-muted">Used by: {steps.filter((step) => step.webhookTemplateId === template.id).map((step) => step.title).join(', ') || 'No steps assigned'}</p>
        <div className="mt-auto grid gap-2">
          {onConnect && template.direction === 'outgoing' && <Button variant="secondary" size="compact" disabled={connectingDisabled} onClick={() => onConnect(template)}>{template.connectionId ? 'Change connection' : 'Set up connection'}</Button>}
          {!reviewed && <p className="text-[10px] leading-relaxed text-muted">{template.availability === 'receiver-needed' || template.direction === 'incoming' ? 'Receiving endpoint identified; live reception is not available yet.' : template.availability === 'credential-needed' ? 'Saved connection found; its credentials are unavailable for delivery.' : 'Connection identified; this suggestion does not create or connect the external service.'}</p>}
          {onReview && <details className="text-[10px] text-muted"><summary className="cursor-pointer text-accent">Connection details</summary><p className="mt-3 leading-relaxed">{template.method} · {template.event}</p><Button variant="text" size="compact" className="mt-2" onClick={() => onReview(template)}>View connection settings</Button>
            {reviewed && <WebhookDeliveryControls compact template={template} workflowId={saved?.id} version={saved?.version} enabled={canDeliver && steps.some((step) => step.webhookTemplateId === template.id && !webhookMappingsIssue(step, template))} />}
          </details>}
        </div>
      </article>
    })}</div>
    {!templates.length && <p className="py-5 text-xs text-muted">Muse did not identify any required webhooks for this plan.</p>}
  </section>
}
