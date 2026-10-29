import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { Button } from '../../../components/ui/Button'
import { Icon } from '../../../components/ui/Icon'
import { DIAGRAM_ACCEPT, formatFileSize } from '../validation'

type DiagramUploadProps = {
  file: File | null
  previewUrl: string | null
  error: string | null
  onSelect: (files: File[]) => void
  onRemove: () => void
}

export function DiagramUpload({ file, previewUrl, error, onSelect, onRemove }: DiagramUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)
  const [isDragging, setIsDragging] = useState(false)
  const [failedPreviewUrl, setFailedPreviewUrl] = useState<string | null>(null)
  const previewFailed = previewUrl !== null && failedPreviewUrl === previewUrl

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    dragDepth.current = 0
    setIsDragging(false)
    onSelect(Array.from(event.dataTransfer.files))
  }

  const isPdf = file?.name.toLowerCase().endsWith('.pdf')

  return (
    <div>
      <input ref={inputRef} type="file" id="diagram-file" accept={DIAGRAM_ACCEPT} hidden
        onChange={(event) => {
          onSelect(Array.from(event.target.files ?? []))
          event.target.value = ''
        }} />
      <div className={`flex min-h-52 flex-col items-center justify-center rounded-lg border border-dashed px-2.5 py-4 text-center transition-[background-color,border-color,box-shadow] duration-200 ease-out motion-reduce:transition-none ${isDragging ? 'border-accent bg-accent-soft ring-2 ring-accent/15' : 'border-[#c9cff3] bg-[#fbfbff] hover:border-accent/60 hover:bg-accent-soft/40'}`}
        role="group" aria-label="Upload a diagram" aria-describedby="diagram-requirements"
        onDragEnter={(event) => {
          event.preventDefault()
          dragDepth.current += 1
          setIsDragging(true)
        }}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }}
        onDragLeave={(event) => {
          event.preventDefault()
          dragDepth.current = Math.max(0, dragDepth.current - 1)
          if (dragDepth.current === 0) setIsDragging(false)
        }}
        onDrop={handleDrop}>
        <span className="mb-2.5 grid size-10 place-items-center rounded-[10px] bg-accent-soft text-accent"><Icon name="upload" width="25" height="25" /></span>
        <p className="text-xs font-semibold">{isDragging ? 'Release to add your diagram' : 'Drop your diagram here'}</p>
        <p className="mt-1.5 mb-3 text-[10px] text-muted">A whiteboard photo, flowchart, or sketch</p>
        <Button variant="secondary" size="compact" onClick={() => inputRef.current?.click()}>
          {file ? 'Replace file' : 'Choose file'}
        </Button>
        <span id="diagram-requirements" className="mt-2.5 text-[9px] text-muted">PNG, JPG, or PDF · up to 10 MB</span>
      </div>
      {error && <p className="mt-2.5 text-[11px] leading-relaxed text-danger motion-safe:animate-reveal" role="alert">{error}</p>}
      {file && (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-line bg-[#fcfcfd] p-3 motion-safe:animate-reveal">
          <div className="grid h-11 w-10.5 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-surface text-accent">
            {!isPdf && previewUrl && !previewFailed
              ? <img src={previewUrl} alt="Selected diagram" className="size-full object-cover" onError={() => setFailedPreviewUrl(previewUrl)} />
              : <Icon name="file" width="23" height="23" />}
          </div>
          <div className="grid min-w-0 flex-1 gap-1">
            <span className="truncate text-[11px] font-semibold" title={file.name}>{file.name}</span>
            <span className="text-[9px] text-muted">{formatFileSize(file.size)} · Selected locally</span>
            {previewFailed && <span className="text-[9px] text-muted">Image preview unavailable</span>}
            {previewUrl && <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 justify-self-start text-[9px] text-accent transition-colors duration-200 hover:text-accent-hover hover:underline motion-reduce:transition-none">
              Open preview <Icon name="external" width="11" height="11" />
            </a>}
          </div>
          <button type="button" className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-muted transition-colors duration-200 hover:bg-red-50 hover:text-danger motion-reduce:transition-none" onClick={onRemove} aria-label={`Remove ${file.name}`}>
            <Icon name="close" width="17" height="17" />
          </button>
        </div>
      )}
    </div>
  )
}
