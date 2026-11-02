import { useEffect, useRef, useState } from 'react'
import type { SavedWorkflow, WorkflowDraft, WorkflowSummary } from '../../../../../shared/workflows'
import { Button } from '../../../components/ui/Button'
import { getWorkflow, listWorkflows, saveWorkflow } from '../api'
import { isWorkflowDirty } from '../draftState'

type Props = {
  draft: WorkflowDraft
  saved: SavedWorkflow | null
  onSaved: (workflow: SavedWorkflow) => void
  onOpen: (workflow: SavedWorkflow) => void
  onRename: (title: string) => void
}
export function WorkflowStorage({ draft, saved, onSaved, onOpen, onRename }: Props) {
  const [recent, setRecent] = useState<WorkflowSummary[]>([])
  const [listing, setListing] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [listError, setListError] = useState('')
  const [message, setMessage] = useState('')
  const [selected, setSelected] = useState(saved?.id ?? '')
  const [refresh, setRefresh] = useState(0)
  const locked = useRef(false)
  const mounted = useRef(false)
  const dirty = isWorkflowDirty(draft, saved)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    listWorkflows(controller.signal).then((items) => {
      setRecent(items)
      setSelected((current) => items.some((item) => item.id === current) ? current : items[0]?.id ?? '')
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setListError(cause instanceof Error ? cause.message : 'Saved drafts could not be loaded.')
    }).finally(() => { if (!controller.signal.aborted) setListing(false) })
    return () => controller.abort()
  }, [refresh])

  async function save() {
    if (locked.current) return
    locked.current = true
    setBusy(true); setError(''); setMessage('')
    try {
      const workflow = await saveWorkflow(draft, saved)
      if (!mounted.current) return
      onSaved(workflow)
      setSelected(workflow.id)
      setMessage('Draft saved.')
      setListing(true); setListError(''); setRefresh((value) => value + 1)
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'The draft could not be saved.')
    } finally {
      locked.current = false
      if (mounted.current) setBusy(false)
    }
  }
  async function open() {
    if (!selected || locked.current) return
    if (dirty && !window.confirm('Open this saved draft? Unsaved changes to the current workflow will be discarded.')) return
    locked.current = true
    setBusy(true); setError(''); setMessage('')
    try {
      const workflow = await getWorkflow(selected)
      if (mounted.current) onOpen(workflow)
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'The draft could not be opened.')
    } finally {
      locked.current = false
      if (mounted.current) setBusy(false)
    }
  }
  return <section className="mb-5 rounded-xl border border-line bg-surface p-5 xl:p-6" aria-labelledby="draft-storage-heading" aria-busy={busy}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="draft-storage-heading" className="text-sm font-semibold">Workflow draft</h2>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">Save your plan and diagram structure. Uploaded files and run history stay in this session.</p>
      </div>
      <span className="text-[11px] text-muted">{saved ? `Version ${saved.version} · ${dirty ? 'Unsaved changes' : 'Saved'}` : 'Not saved yet'}</span>
    </div>
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <label className="grid min-w-0 grow gap-2 text-[11px] font-medium" htmlFor="draft-title">Draft name
        <input id="draft-title" value={draft.plan.title} maxLength={200} disabled={busy} onChange={(event) => { onRename(event.target.value); setMessage('') }}
          className="min-h-10 rounded-md border border-line bg-surface px-3 text-xs disabled:opacity-50" />
      </label>
      <Button variant="secondary" disabled={busy || !dirty || !draft.plan.title.trim()} onClick={() => { void save() }}>{busy ? 'Please wait…' : 'Save draft'}</Button>
    </div>
    <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4">
      <div className="grid min-w-0 grow gap-2 text-[11px] font-medium">
        <label htmlFor="saved-drafts">Saved drafts</label>
        <select id="saved-drafts" value={selected} disabled={busy || listing || recent.length === 0} onChange={(event) => setSelected(event.target.value)}
          className="min-h-10 max-w-full rounded-md border border-line bg-surface px-3 text-xs disabled:opacity-50">
          {recent.length === 0 && <option value="">{listing ? 'Loading saved drafts…' : 'No saved drafts'}</option>}
          {recent.map((item) => <option key={item.id} value={item.id}>{item.title} · v{item.version} · {new Date(item.updatedAt).toLocaleString()}</option>)}
        </select>
      </div>
      <Button variant="secondary" disabled={busy || listing || !selected} onClick={() => { void open() }}>Open draft</Button>
      <Button variant="text" disabled={busy || listing} onClick={() => { setListing(true); setListError(''); setRefresh((value) => value + 1) }}>Refresh list</Button>
    </div>
    {error && <p role="alert" className="mt-3 text-xs leading-relaxed text-danger">{error}</p>}
    {listError && <p role="alert" className="mt-3 text-xs leading-relaxed text-danger">{listError}</p>}
    <p role="status" aria-live="polite" className="mt-3 text-xs text-muted">{message}</p>
  </section>
}
