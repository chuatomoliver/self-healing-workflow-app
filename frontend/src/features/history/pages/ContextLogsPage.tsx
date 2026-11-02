import { useState } from 'react'
import type { WorkflowPlan } from '../../../../../shared/workflows'
import type { WorkflowActivity } from '../activity'
import { workflowSetupSummary } from '../../../../../shared/setup'

const labels = { parse: 'Parsing', plan: 'AI planning', setup: 'Setup', save: 'Saved draft', open: 'Opened draft' }
const time = (value: string) => new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
export function ContextLogsPage({ plan, activities }: { plan: WorkflowPlan | null; activities: WorkflowActivity[] }) {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('all')
  const filtered = activities.filter((activity) => (kind === 'all' || activity.kind === kind) && `${activity.workflow} ${activity.message}`.toLowerCase().includes(query.toLowerCase()))
  const setup = plan ? workflowSetupSummary(plan) : null
  return <>
    <header className="mt-8 mb-7"><p className="text-[10px] font-semibold tracking-wide text-accent">STEP 6 OF 6 · CONTEXT & LOGS</p><h1 className="mt-4 text-3xl font-semibold tracking-tight">Your workflow activity.</h1><p className="mt-3 text-xs leading-relaxed text-muted">This timeline tracks parsing, planning, setup, and save actions from your current session.</p></header>
    <section className="rounded-xl border border-line bg-surface p-5"><h2 className="text-sm font-semibold">{plan?.title ?? 'No workflow selected'}</h2>{plan && setup ? <p className="mt-3 text-xs leading-relaxed text-muted">{plan.steps.length} steps · {setup.reviewedSteps} reviewed · {setup.configuredWebhooks}/{plan.webhooks.length} webhooks configured · {plan.questions.length - setup.answeredQuestions} unanswered questions.</p> : <p className="mt-3 text-xs text-muted">Your selected workflow and its setup progress will appear here.</p>}<p className="mt-3 text-[10px] text-muted">Session activity is cleared when the page reloads. Saved drafts remain in the database.</p></section>
    <section className="mt-5 rounded-xl border border-line bg-surface p-5"><h2 className="text-sm font-semibold">Activity timeline</h2><div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]"><label className="text-[11px] text-muted">Search activity<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} className="mt-2 w-full rounded-md border border-line bg-surface p-3 text-xs" /></label><label className="text-[11px] text-muted">Action<select value={kind} onChange={(event) => setKind(event.target.value)} className="mt-2 block w-full rounded-md border border-line bg-surface p-3 text-xs"><option value="all">All actions</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      <ol className="mt-5 grid gap-3">{filtered.map((activity) => <li key={activity.id} className="rounded-lg border border-line p-4"><div className="flex flex-wrap justify-between gap-2"><p className="text-xs font-semibold">{labels[activity.kind]} · {activity.workflow}</p><span className={`text-[10px] ${activity.status === 'failed' ? 'text-danger' : 'text-muted'}`}>{activity.status}</span></div><p className="mt-2 text-[11px] leading-relaxed text-muted">{activity.message}</p><time dateTime={activity.at} className="mt-2 block text-[10px] text-muted">{time(activity.at)}</time></li>)}</ol>
      {!filtered.length && <p className="py-8 text-center text-xs text-muted">{activities.length ? 'No activity matches these filters.' : 'No workflow activity recorded yet.'}</p>}
    </section>
    <section className="my-5 rounded-xl border border-line bg-surface p-5"><h2 className="text-sm font-semibold">Execution and repair history</h2><p className="mt-3 text-xs leading-relaxed text-muted">No live execution service is connected. Run attempts, outputs, delivery status, and repair decisions will be shown only when real records are available.</p></section>
  </>
}
