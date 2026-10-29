import { Button } from '../../../components/ui/Button'
import { Icon } from '../../../components/ui/Icon'
import type { PlanConnection, PlanStep } from '../types'

type PlanConnectionsProps = {
  connections: PlanConnection[]
  steps: PlanStep[]
  onReviewConnection: (connection: PlanConnection) => void
}

export function PlanConnections({ connections, steps, onReviewConnection }: PlanConnectionsProps) {
  return <section className="mt-5 rounded-xl border border-line bg-surface p-5 xl:p-6" aria-labelledby="connections-heading">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="connections-heading" className="text-sm font-semibold">Connection requirements</h2>
      <span className="rounded-md bg-amber-50 px-2 py-1 text-[10px] text-amber-800">{connections.length} accounts to connect</span>
    </div>
    <p className="mt-2 text-[11px] leading-relaxed text-muted">These are sample access requirements. No application accounts are connected.</p>
    <div className="mt-5 grid gap-3 lg:grid-cols-3">
      {connections.map((connection) => {
        const requiredSteps = steps.filter((step) => step.connectionId === connection.id)

        return <article key={connection.id} className="flex min-w-0 flex-col rounded-lg border border-line p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="grid size-8 place-items-center rounded-lg bg-accent-soft text-xs font-semibold text-accent">{connection.provider.charAt(0)}</span>
            <span className="text-[9px] font-medium text-amber-700">Account required</span>
          </div>
          <h3 className="mt-3 text-xs font-semibold">{connection.provider}</h3>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">{connection.purpose}</p>
          <p className="mt-3 mb-4 text-[10px] leading-relaxed text-muted">Used by: {requiredSteps.map((step) => step.title).join(', ') || 'No steps assigned'}</p>
          <Button variant="secondary" size="compact" className="mt-auto" onClick={() => onReviewConnection(connection)}>Connect {connection.provider}<Icon name="arrow" width="12" height="12" /></Button>
        </article>
      })}
    </div>
    {connections.length === 0 && <p className="py-5 text-xs text-muted">This plan does not require external application accounts.</p>}
  </section>
}
