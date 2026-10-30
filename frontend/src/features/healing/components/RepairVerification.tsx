import { Button } from '../../../components/ui/Button'
import { Icon } from '../../../components/ui/Icon'
import type { RepairCheck } from '../types'

const checkTitles = [
  { id: 'schema', title: 'Required fields' },
  { id: 'rename', title: 'Field rename' },
  { id: 'integrity', title: 'Payload integrity' },
  { id: 'mapping', title: 'Template & mapping' },
]

export function RepairVerification({ checks, locked, onVerify }: { checks: RepairCheck[] | null; locked: boolean; onVerify: () => void }) {
  const passedCount = checks?.filter((check) => check.passed).length ?? 0
  return <section className="min-w-0 rounded-xl border border-line bg-surface p-5 xl:p-6" aria-labelledby="repair-verification-heading">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="repair-verification-heading" className="text-sm font-semibold">Verification</h2><span className="rounded-md bg-slate-100 px-2 py-1 text-[9px] font-medium text-muted">{passedCount} / {checkTitles.length} passed</span></div>
    <ul className="mt-4 divide-y divide-line" aria-live="polite">
      {checkTitles.map((item) => {
        const result = checks?.find((check) => check.id === item.id)
        return <li key={item.id} className="flex items-start gap-2.5 py-3.5">
          <Icon name={result?.passed ? 'check' : 'info'} width="15" height="15" className={`mt-0.5 shrink-0 ${result?.passed ? 'text-emerald-600' : result ? 'text-danger' : 'text-slate-400'}`} />
          <div className="min-w-0 flex-1"><p className="text-xs font-medium">{item.title}</p>{result && <p className="mt-1 text-[10px] leading-relaxed text-muted">{result.passed ? result.detail : 'Review this check before applying the repair.'}</p>}</div>
          <span className={`shrink-0 rounded-md px-2 py-1 text-[9px] font-medium ${result?.passed ? 'bg-emerald-50 text-emerald-800' : result ? 'bg-red-50 text-danger' : 'bg-slate-100 text-muted'}`}>{result ? result.passed ? 'Passed' : 'Needs attention' : 'Not run'}</span>
        </li>
      })}
    </ul>
    <Button variant={passedCount === checkTitles.length ? 'secondary' : 'primary'} className="mt-4 w-full" disabled={locked} onClick={onVerify}><Icon name="check" width="15" height="15" />{checks ? 'Run checks again' : 'Verify repair'}</Button>
  </section>
}
