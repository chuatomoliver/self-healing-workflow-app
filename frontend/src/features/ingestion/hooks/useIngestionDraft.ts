import { useEffect, useState } from 'react'
import type { IngestionDraft } from '../types'
import { prepareIngestionDraft, validateDiagram } from '../validation'

export function useIngestionDraft() {
  const [prompt, setPrompt] = useState('')
  const [attachment, setAttachment] = useState<{ file: File; previewUrl: string } | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [readyDraft, setReadyDraft] = useState<IngestionDraft | null>(null)
  const diagram = attachment?.file ?? null

  useEffect(() => {
    return () => {
      if (attachment) URL.revokeObjectURL(attachment.previewUrl)
    }
  }, [attachment])

  function updatePrompt(value: string) {
    setPrompt(value)
    setFormError(null)
    setReadyDraft(null)
  }

  function selectFiles(files: File[]) {
    if (files.length === 0) return
    setReadyDraft(null)
    if (files.length !== 1) {
      setFileError('Files were not added. Add one diagram at a time.')
      return
    }
    const error = validateDiagram(files[0])
    setFileError(error ? `File was not added. ${error}` : null)
    if (!error) {
      setAttachment({ file: files[0], previewUrl: URL.createObjectURL(files[0]) })
      setFormError(null)
    }
  }

  function removeDiagram() {
    setAttachment(null)
    setFileError(null)
    setFormError(null)
    setReadyDraft(null)
  }

  function prepareDraft() {
    const result = prepareIngestionDraft(prompt, diagram)
    setFormError(result.ok ? null : result.error)
    setReadyDraft(result.ok ? result.draft : null)
    return result.ok
  }

  return { prompt, diagram, previewUrl: attachment?.previewUrl ?? null, fileError, formError, readyDraft, updatePrompt, selectFiles, removeDiagram, prepareDraft }
}
