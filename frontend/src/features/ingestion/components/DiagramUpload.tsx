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
    <div className="diagram-upload">
      <input ref={inputRef} type="file" id="diagram-file" accept={DIAGRAM_ACCEPT} hidden
        onChange={(event) => {
          onSelect(Array.from(event.target.files ?? []))
          event.target.value = ''
        }} />
      <div className={`dropzone ${isDragging ? 'is-dragging' : ''}`}
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
        <span className="upload-icon"><Icon name="upload" width="25" height="25" /></span>
        <p className="dropzone-title">{isDragging ? 'Release to add your diagram' : 'Drop your diagram here'}</p>
        <p className="dropzone-description">A whiteboard photo, flowchart, or sketch</p>
        <Button variant="secondary" onClick={() => inputRef.current?.click()}>
          {file ? 'Replace file' : 'Choose file'}
        </Button>
        <span id="diagram-requirements" className="file-requirements">PNG, JPG, or PDF · up to 10 MB</span>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      {file && (
        <div className="selected-file">
          <div className="file-thumbnail">
            {!isPdf && previewUrl && !previewFailed
              ? <img src={previewUrl} alt="Selected diagram" onError={() => setFailedPreviewUrl(previewUrl)} />
              : <Icon name="file" width="23" height="23" />}
          </div>
          <div className="selected-file-details">
            <span className="selected-file-name" title={file.name}>{file.name}</span>
            <span className="selected-file-meta">{formatFileSize(file.size)} · Selected locally</span>
            {previewFailed && <span className="selected-file-meta">Image preview unavailable</span>}
            {previewUrl && <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="preview-link">
              Open preview <Icon name="external" width="11" height="11" />
            </a>}
          </div>
          <button type="button" className="remove-file" onClick={onRemove} aria-label={`Remove ${file.name}`}>
            <Icon name="close" width="17" height="17" />
          </button>
        </div>
      )}
    </div>
  )
}
