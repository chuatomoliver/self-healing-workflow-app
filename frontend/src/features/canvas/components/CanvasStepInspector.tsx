import { useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { Icon } from '../../../components/ui/Icon'
import { NodeRoleBadge } from '../../diagram-parsing/components/NodeRoleBadge'
import { WebhookStatus } from '../../workflows/components/WebhookStatus'
import type { PlanStep, PlanWebhookTemplate, WebhookConnectionState } from '../../workflows/types'
import { canvasStepStates } from '../presentation'
import type { CanvasStepStatus } from '../types'

type CanvasStepInspectorProps = {
  step: PlanStep
  state: CanvasStepStatus
  webhook?: PlanWebhookTemplate
  connections: WebhookConnectionState
  output?: Record<string, unknown>
  running: boolean
  onRename: (id: string, title: string) => void
  onReviewWebhook: (template: PlanWebhookTemplate) => void
}

export function CanvasStepInspector({ step, state, webhook, connections, output, running, onRename, onReviewWebhook }: CanvasStepInspectorProps) {
  const [name, setName] = useState(step.title)
  const [message, setMessage] = useState('')
  const [invalid, setInvalid] = useState(false)
  const presentation = canvasStepStates[state]

  return <div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><NodeRoleBadge role={step.role} /><span className={`rounded-md px-2 py-1 text-[9px] font-medium ${presentation.colors}`}>{presentation.label}</span></div>
    <form className="mt-4" onSubmit={(event) => {
      event.preventDefault()
      const trimmed = name.trim()
      if (!trimmed) { setInvalid(true); setMessage('Enter a name for this step.'); return }
      onRename(step.id, trimmed)
      setName(trimmed); setInvalid(false); setMessage('Name updated.')
    }}>
      <label htmlFor="canvas-step-name" className="text-[11px] font-medium">Display name</label>
      <input id="canvas-step-name" value={name} maxLength={80} disabled={running} aria-invalid={invalid} aria-describedby="step-name-feedback"
        onChange={(event) => { setName(event.target.value); setMessage(''); setInvalid(false) }}
        className="mt-2 w-full min-w-0 rounded-md border border-line bg-surface px-3 py-2.5 text-xs outline-none focus:border-accent focus:ring-3 focus:ring-accent/10 disabled:bg-slate-50" />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><span className="text-[9px] text-muted">{name.length} / 80 characters</span><Button type="submit" variant="secondary" size="compact" disabled={running}>Apply name</Button></div>
      <p id="step-name-feedback" role="status" className={`mt-2 text-[10px] leading-relaxed ${invalid ? 'text-danger' : 'text-muted'}`}>{message}</p>
    </form>
    <p className="mt-4 text-[11px] leading-relaxed text-muted">{step.description}</p>
    <div className="mt-4 rounded-lg bg-slate-50 p-3"><p className="text-[9px] font-medium tracking-wide text-muted">OPERATION</p><p className="mt-1 text-xs leading-relaxed font-medium">{step.operation}</p></div>
    {webhook && <div className="mt-4 rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[11px] font-medium">{webhook.name}</p><WebhookStatus state={connections[webhook.id]} /></div>
      <p className="mt-2 text-[10px] leading-relaxed text-muted">{webhook.direction === 'incoming' ? 'Incoming' : 'Outgoing'} · {webhook.method} · <code className="wrap-anywhere">{webhook.event}</code></p>
      <Button variant="text" size="inline" className="mt-2" onClick={() => onReviewWebhook(webhook)}>View webhook template<Icon name="arrow" width="12" height="12" /></Button>
    </div>}
    {step.configuration.some((setting) => setting.needsInput) && <p className="mt-4 rounded-md bg-amber-50 p-3 text-[10px] leading-relaxed text-amber-800">Urgency rule required.</p>}
    {step.mappings.length > 0 && <details className="mt-4 border-t border-line pt-3">
      <summary className="cursor-pointer text-[11px] font-medium">Field mappings · {step.mappings.length}</summary>
      <ul className="mt-3 grid gap-2">{step.mappings.map((mapping) => <li key={`${mapping.source}-${mapping.target}`} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-[10px] leading-relaxed"><code className="wrap-anywhere text-muted">{mapping.source}</code><Icon name="arrow" width="12" height="12" className="text-slate-400" /><code className="wrap-anywhere">{mapping.target}</code></li>)}</ul>
    </details>}
    <div className="mt-4 border-t border-line pt-3"><h3 className="text-[11px] font-semibold">Output</h3>
      {output ? <pre className="mt-3 max-h-60 overflow-auto rounded-lg bg-slate-950 p-3 text-[10px] leading-[1.8] text-slate-200"><code>{JSON.stringify(output, null, 2)}</code></pre>
        : <p className="mt-2 text-[10px] leading-relaxed text-muted">No output yet.</p>}
    </div>
  </div>
}
