import { Icon } from '../../../components/ui/Icon'
import type { RepairProposal } from '../types'

export function RepairPayloadDiff({ proposal }: { proposal: RepairProposal }) {
  const panes = [
    { label: 'Rejected payload', payload: proposal.originalPayload, field: proposal.originalField, marker: '−', colors: 'bg-red-400/10 text-red-300' },
    { label: 'Proposed payload', payload: proposal.repairedPayload, field: proposal.replacementField, marker: '+', colors: 'bg-emerald-400/10 text-emerald-300' },
  ]

  return <section className="mt-5 min-w-0 rounded-xl border border-line bg-surface p-5 xl:p-6" aria-labelledby="repair-proposal-heading">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="repair-proposal-heading" className="text-sm font-semibold">Proposed repair</h2><span className="flex items-center gap-1.5 rounded-md bg-accent-soft px-2 py-1 text-[9px] font-medium text-accent"><Icon name="sparkle" width="12" height="12" />MUSE AI</span></div>
    <h3 className="mt-4 text-xs font-semibold">{proposal.title}</h3>
    <p className="mt-2 text-[11px] leading-relaxed text-muted">{proposal.explanation}</p>
    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      {panes.map((pane) => <div key={pane.label} className="min-w-0 overflow-hidden rounded-lg border border-line">
        <div className="border-b border-line bg-slate-50 px-4 py-3 text-[11px] font-medium">{pane.label}</div>
        <pre className="overflow-auto bg-slate-950 py-4 text-[10px] leading-[1.9] text-slate-300" aria-label={pane.label}><code>{JSON.stringify(pane.payload, null, 2).split('\n').map((line, index) => {
          const changed = line.trimStart().startsWith(`"${pane.field}":`)
          return <span key={index} className={`block px-3 ${changed ? pane.colors : ''}`}>{changed ? pane.marker : ' '}{' '}{line}</span>
        })}</code></pre>
      </div>)}
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-slate-50 px-3 py-2.5 text-[10px] leading-relaxed">
      <span className="font-medium text-muted">Field mapping</span><code className="wrap-anywhere text-danger">webhook.payload.{proposal.originalField}</code><Icon name="arrow" width="12" height="12" className="text-slate-400" /><code className="wrap-anywhere text-emerald-800">webhook.payload.{proposal.replacementField}</code>
    </div>
  </section>
}
