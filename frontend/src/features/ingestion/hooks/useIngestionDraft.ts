import { useEffect, useState } from 'react'
import { prepareIngestionDraft, validateDiagram } from '../validation'

export function useIngestionDraft(initialPrompt = '', initialFile: File | null = null) {
  const [prompt, setPrompt] = useState(initialPrompt)
  const [diagram, setDiagram] = useState<File | null>(initialFile)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    // The preview mirrors a browser-managed resource; cleanup must also work during StrictMode remounts.
    // oxlint-disable-next-line react/set-state-in-effect
    if (!diagram) { setPreviewUrl(null); return }
    const url = URL.createObjectURL(diagram)
    // oxlint-disable-next-line react/set-state-in-effect
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [diagram])

  function updatePrompt(value: string) {
    setPrompt(value)
    setFormError(null)
  }

  function selectFiles(files: File[]) {
    if (files.length === 0) return
    if (files.length !== 1) {
      setFileError('Files were not added. Add one diagram at a time.')
      return
    }
    const error = validateDiagram(files[0])
    setFileError(error ? `File was not added. ${error}` : null)
    if (!error) {
      setDiagram(files[0])
      setFormError(null)
    }
  }

  function removeDiagram() {
    setDiagram(null)
    setFileError(null)
    setFormError(null)
  }

  function prepareDraft() {
    const result = prepareIngestionDraft(prompt, diagram)
    setFormError(result.ok ? null : result.error)
    return result.ok ? result.draft : null
  }

  return { prompt, diagram, previewUrl, fileError, formError, updatePrompt, selectFiles, removeDiagram, prepareDraft }
}

export type IngestionFormState = ReturnType<typeof useIngestionDraft>
