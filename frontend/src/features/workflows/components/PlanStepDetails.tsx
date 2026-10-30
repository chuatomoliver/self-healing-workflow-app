import type { RefObject } from 'react'
import { Button } from '../../../components/ui/Button'
import { Icon } from '../../../components/ui/Icon'
import { NodeRoleBadge } from '../../diagram-parsing/components/NodeRoleBadge'
import type { PlanStep, PlanWebhookTemplate, WebhookConnectionState, WorkflowPlan } from '../types'
import { WebhookStatus } from './WebhookStatus'

type PlanStepDetailsProps = {
  step: PlanStep
  plan: WorkflowPlan
  containerRef: RefObject<HTMLElement | null>
  webhookConnections: WebhookConnectionState
  onReviewWebhook: (template: PlanWebhookTemplate) => void
}

export function PlanStepDetails({ step, plan, containerRef, webhookConnections, onReviewWebhook }: PlanStepDetailsProps) {
  const webhook = plan.webhooks.find((item) => item.id === step.webhookTemplateId)
  const outgoingEdges = plan.edges.filter((edge) => edge.source === step.id)

  return <section id="plan-step-details" ref={containerRef} tabIndex={-1} className="min-w-0 rounded-xl border border-line bg-surface p-5 xl:p-6" aria-labelledby="step-details-heading">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-[9px] font-semibold tracking-wider text-muted">STEP {String(plan.steps.findIndex((item) => item.id === step.id) + 1).padStart(2, '0')} · {step.id.toUpperCase()}</p>
      <NodeRoleBadge role={step.role} />
    </div>
    <h2 id="step-details-heading" className="mt-3 text-base font-semibold tracking-tight">{step.title}</h2>
    <p className="mt-2 text-xs leading-relaxed text-muted">{step.description}</p>

    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-slate-50/70 p-3.5">
      <div><p className="text-[9px] tracking-wide text-muted">PROPOSED OPERATION</p>
        <p className="mt-1 text-xs font-medium">{step.operation}</p>
        <p className="mt-1 text-[10px] text-muted">{webhook ? `${webhook.name} · ${webhook.direction} webhook` : 'Workflow logic'}</p>
      </div>
      {webhook && <div className="flex flex-wrap items-center gap-3"><WebhookStatus state={webhookConnections[webhook.id]} /><Button variant="text" size="inline" onClick={() => onReviewWebhook(webhook)}>View webhook<Icon name="arrow" width="12" height="12" /></Button></div>}
    </div>

    <div className="mt-5">
      <h3 className="mb-3 text-xs font-semibold">Configuration</h3>
      <dl className="divide-y divide-line rounded-lg border border-line px-3.5">
        {step.configuration.map((setting) => <div key={setting.label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-3 py-3 text-[11px] leading-relaxed">
          <dt className="text-muted">{setting.label}</dt>
          <dd className={setting.needsInput ? 'text-amber-800' : 'text-ink'}>
            {setting.value}
            {setting.needsInput && <span className="mt-1 block text-[9px] font-medium text-amber-700">Needs input</span>}
          </dd>
        </div>)}
      </dl>
    </div>

    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      {[{ title: 'Receives', fields: step.inputs }, { title: 'Produces', fields: step.outputs }].map((group) => <div key={group.title} className="min-w-0">
        <h3 className="mb-2 text-xs font-semibold">{group.title}</h3>
        <ul className="grid gap-2">
          {group.fields.map((field) => <li key={field.name} className="rounded-lg bg-slate-50 p-3">
            <code className="text-[10px] font-medium wrap-anywhere text-accent">{field.name}</code>
            <p className="mt-1 text-[10px] leading-relaxed text-muted">{field.description}</p>
          </li>)}
        </ul>
      </div>)}
    </div>

    {step.mappings.length > 0 && <div className="mt-5">
      <h3 className="mb-3 text-xs font-semibold">Field mappings</h3>
      <ul className="grid gap-2">
        {step.mappings.map((mapping) => <li key={`${mapping.source}-${mapping.target}`} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-md border border-line p-2.5 text-[10px]">
          <code className="wrap-anywhere text-muted">{mapping.source}</code>
          <Icon name="arrow" width="13" height="13" className="text-slate-400" />
          <code className="wrap-anywhere text-ink">{mapping.target}</code>
        </li>)}
      </ul>
    </div>}

    {outgoingEdges.length > 0 && <div className="mt-5 border-t border-line pt-4">
      <h3 className="mb-3 text-xs font-semibold">What follows</h3>
      <ul className="grid gap-2">
        {outgoingEdges.map((edge) => <li key={edge.id} className="flex items-center gap-2 text-[11px] leading-relaxed">
          <Icon name="arrow" width="13" height="13" className="shrink-0 text-accent" />
          {edge.label && <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[9px] font-medium text-accent">{edge.label}</span>}
          <span>{plan.steps.find((item) => item.id === edge.target)?.title ?? edge.target}</span>
        </li>)}
      </ul>
    </div>}
  </section>
}
