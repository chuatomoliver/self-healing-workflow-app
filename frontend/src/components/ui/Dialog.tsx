import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Icon } from './Icon'

type DialogProps = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

export function Dialog({ open, title, onClose, children }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (open && !dialog?.open) dialog?.showModal()
    else if (!open && dialog?.open) dialog.close()
  }, [open])

  return <dialog ref={dialogRef} aria-label={title}
    onCancel={(event) => { event.preventDefault(); onClose() }}
    className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-slate-950/30 backdrop:backdrop-blur-xs open:motion-safe:animate-reveal">
    <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <button type="button" onClick={onClose} aria-label="Close dialog"
        className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-muted transition-colors duration-200 hover:bg-slate-100 hover:text-ink motion-reduce:transition-none">
        <Icon name="close" width="17" height="17" />
      </button>
    </div>
    <div className="p-6">{children}</div>
  </dialog>
}
