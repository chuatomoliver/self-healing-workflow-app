export type IngestionDraft = {
  prompt: string
  diagram: File | null
  nextStep: 'parse-diagram' | 'review-plan'
}

export type DraftResult =
  | { ok: true; draft: IngestionDraft }
  | { ok: false; error: string }
