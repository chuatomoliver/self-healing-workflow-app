import { useState } from 'react'
import { Dialog } from '../../../components/ui/Dialog'
import { Button } from '../../../components/ui/Button'
import type { PlanStep } from '../types'
import { stepSetupIssues } from '../../../../../shared/setup.ts'
import { PairRows, setupInput } from './SetupFields'

export function StepSetupDialog({ step, onApply, onClose }: { step: PlanStep; onApply: (step: PlanStep) => void; onClose: () => void }) {
  const [value, setValue] = useState<PlanStep>(() => structuredClone(step))
  const [error, setError] = useState('')
  const issues = stepSetupIssues(value)
  const update = (patch: Partial<PlanStep>) => { setValue((current) => ({ ...current, ...patch, reviewed: false })); setError('') }
  return <Dialog open title={`Set up ${step.title}`} onClose={onClose}>
    <form onSubmit={(event) => {
      event.preventDefault()
      if (!value.title.trim() || !value.operation.trim() || value.configuration.some((item) => !item.label.trim())
        || value.inputs.some((item) => !item.name.trim()) || value.outputs.some((item) => !item.name.trim())
        || value.mappings.some((item) => !item.source.trim() || !item.target.trim() || item.source.length > 200 || item.target.length > 200)) {
        setError('Complete the row names and both sides of each mapping, or remove unused rows.'); return
      }
      if (value.reviewed && issues.length) { setError(issues[0]); return }
      onApply({ ...value, title: value.title.trim(), operation: value.operation.trim() })
    }}>
      <p className="mb-4 text-[11px] leading-relaxed text-muted">Adjust the proposed operation and the information this step receives or produces. Applying setup changes your draft without running the step or calling Muse.</p>
      <label className="block text-[11px] font-medium">Step name<input className={setupInput} value={value.title} maxLength={200} required onChange={(event) => update({ title: event.target.value })} /></label>
      <label className="mt-3 block text-[11px] font-medium">Operation<input className={setupInput} value={value.operation} maxLength={200} required onChange={(event) => update({ operation: event.target.value })} /></label>
      <label className="mt-3 block text-[11px] font-medium">Description<textarea className={setupInput} rows={3} value={value.description} maxLength={4000} onChange={(event) => update({ description: event.target.value })} /></label>
      <fieldset className="mt-5 border-t border-line pt-4"><legend className="text-xs font-semibold">Configuration</legend>
        {value.configuration.map((setting, index) => <div key={index} className="mt-3 rounded-lg border border-line p-3">
          <label className="block text-[11px] text-muted">Setting name {index + 1}<input className={setupInput} value={setting.label} maxLength={200} onChange={(event) => update({ configuration: value.configuration.map((item, at) => at === index ? { ...item, label: event.target.value } : item) })} /></label>
          <label className="mt-2 block text-[11px] text-muted">Setting value {index + 1}<textarea className={setupInput} value={setting.value} rows={2} maxLength={4000} onChange={(event) => update({ configuration: value.configuration.map((item, at) => at === index ? { ...item, value: event.target.value } : item) })} /></label>
          <label className="mt-3 flex items-center gap-2 text-[11px]"><input type="checkbox" checked={!!setting.needsInput} onChange={(event) => update({ configuration: value.configuration.map((item, at) => at === index ? { ...item, needsInput: event.target.checked } : item) })} />Still needs input</label>
          <Button variant="text" size="compact" className="mt-2" onClick={() => update({ configuration: value.configuration.filter((_, at) => at !== index) })}>Remove setting {index + 1}</Button>
        </div>)}
        <Button variant="secondary" size="compact" className="mt-3" disabled={value.configuration.length >= 100} onClick={() => update({ configuration: [...value.configuration, { label: '', value: '', needsInput: true }] })}>Add setting</Button>
      </fieldset>
      <PairRows title="Inputs" labels={['Field name', 'Description']} rows={value.inputs.map((item) => ({ first: item.name, second: item.description }))} onChange={(rows) => update({ inputs: rows.map((item) => ({ name: item.first, description: item.second })) })} />
      <PairRows title="Outputs" labels={['Field name', 'Description']} rows={value.outputs.map((item) => ({ first: item.name, second: item.description }))} onChange={(rows) => update({ outputs: rows.map((item) => ({ name: item.first, description: item.second })) })} />
      <PairRows title="Mappings" labels={['Source field path', 'Target field path']} maxSecondLength={200} rows={value.mappings.map((item) => ({ first: item.source, second: item.target }))} onChange={(rows) => update({ mappings: rows.map((item) => ({ source: item.first, target: item.second })) })} />
      {issues.length > 0 && <ul className="mt-4 list-disc space-y-1 rounded-lg bg-amber-50 p-4 pl-7 text-[11px] text-amber-900">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
      <label className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed"><input type="checkbox" checked={!!value.reviewed} disabled={issues.length > 0} onChange={(event) => setValue((current) => ({ ...current, reviewed: event.target.checked }))} />I have reviewed this step's setup. It has not been executed or tested.</label>
      {error && <p role="alert" className="mt-3 text-xs text-danger">{error}</p>}
      <div className="mt-5 flex gap-3"><Button type="submit">Apply to draft</Button><Button variant="secondary" onClick={onClose}>Cancel</Button></div>
    </form>
  </Dialog>
}
