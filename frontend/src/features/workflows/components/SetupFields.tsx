import { Button } from '../../../components/ui/Button'

export const setupInput = 'mt-1.5 w-full min-w-0 rounded-md border border-line bg-surface px-3 py-2.5 text-xs text-ink outline-none focus:border-accent focus:ring-3 focus:ring-accent/10 disabled:bg-slate-50'
export function PairRows({ title, labels, rows, onChange, maxRows = 100, maxFirstLength = 200, maxSecondLength = 4000 }: {
  title: string; labels: [string, string]; rows: { first: string; second: string }[]
  onChange: (rows: { first: string; second: string }[]) => void; maxRows?: number; maxFirstLength?: number; maxSecondLength?: number
}) {
  return <fieldset className="mt-5 min-w-0 border-t border-line pt-4">
    <legend className="px-1 text-xs font-semibold">{title}</legend>
    <div className="grid gap-3">{rows.map((row, index) => <div key={index} className="rounded-lg border border-line p-3">
      <label className="block text-[11px] text-muted">{labels[0]} {index + 1}<input className={setupInput} value={row.first} maxLength={maxFirstLength} onChange={(event) => onChange(rows.map((item, at) => at === index ? { ...item, first: event.target.value } : item))} /></label>
      <label className="mt-2 block text-[11px] text-muted">{labels[1]} {index + 1}<textarea className={setupInput} rows={2} value={row.second} maxLength={maxSecondLength} onChange={(event) => onChange(rows.map((item, at) => at === index ? { ...item, second: event.target.value } : item))} /></label>
      <Button variant="text" size="compact" className="mt-2" onClick={() => onChange(rows.filter((_, at) => at !== index))}>Remove row {index + 1}</Button>
    </div>)}</div>
    {!rows.length && <p className="my-2 text-[11px] text-muted">No fields added.</p>}
    <Button variant="secondary" size="compact" className="mt-3" disabled={rows.length >= maxRows} onClick={() => onChange([...rows, { first: '', second: '' }])}>Add {title.toLowerCase()} field</Button>
  </fieldset>
}
