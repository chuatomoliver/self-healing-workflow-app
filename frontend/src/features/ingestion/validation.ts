import type { DraftResult } from './types'

export const MAX_PROMPT_LENGTH = 4000
export const MAX_DIAGRAM_BYTES = 10 * 1024 * 1024
export const DIAGRAM_ACCEPT = '.png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf'

const supportedTypes: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', pdf: 'application/pdf',
}

export function validateDiagram(file: Pick<File, 'name' | 'size' | 'type'>): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  const expectedType = Object.hasOwn(supportedTypes, extension) ? supportedTypes[extension] : undefined

  if (!expectedType || (file.type && file.type !== expectedType)) {
    return 'Choose a PNG, JPG, or PDF file.'
  }
  if (file.size === 0) return 'This file is empty. Choose a different file.'
  if (file.size > MAX_DIAGRAM_BYTES) return 'Your file is too large. Choose a file up to 10 MB.'
  return null
}

export function prepareIngestionDraft(prompt: string, diagram: File | null): DraftResult {
  const trimmedPrompt = prompt.trim()
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return { ok: false, error: 'Keep your description within 4,000 characters.' }
  }
  if (!trimmedPrompt && !diagram) {
    return { ok: false, error: 'Describe your workflow or add a diagram to continue.' }
  }
  if (diagram) {
    const error = validateDiagram(diagram)
    if (error) return { ok: false, error }
  }
  return {
    ok: true,
    draft: { prompt: trimmedPrompt, diagram, nextStep: diagram ? 'parse-diagram' : 'review-plan' },
  }
}

export function formatFileSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.ceil(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
