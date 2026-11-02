import type { ParseAttachment, ParseWorkflowResponse } from '../../../../shared/parsing.ts'
import { MUSE_PARSE_MODEL } from '../../../../shared/parsing.ts'
import { prepareIngestionDraft } from '../ingestion/validation.ts'

const errors: Record<string, string> = {
  MUSE_NOT_CONFIGURED: 'Muse is not configured. Run npm.cmd run muse:setup from the backend folder, then try again.',
  MUSE_KEY_STORAGE_UNAVAILABLE: 'The backend cannot read the saved key. Check its Windows account or supply MODEL_API_KEY.',
  MUSE_AUTH_FAILED: 'The Muse key or model access was rejected. Run Muse setup again in the backend folder.',
  MUSE_BILLING_REQUIRED: 'Check billing in the Meta developer dashboard before parsing again.',
  MUSE_RATE_LIMITED: 'Muse usage or rate limit reached. Check your quota before trying again.',
  PARSE_BUSY: 'Another workflow is being parsed. Wait for it to finish before trying again.',
  MUSE_TIMEOUT: 'Parsing timed out or was cancelled. A request may already have reached Muse; review before trying again.',
  MUSE_INVALID_RESPONSE: 'Muse could not produce a valid workflow. Clarify the steps and connections or use a clearer diagram.',
  MUSE_INPUT_REJECTED: 'Muse could not process this input. Try a clearer description or a different diagram.',
  MUSE_UNAVAILABLE: 'Muse is temporarily unavailable. Try again later.',
  NO_WORKFLOW_FOUND: 'No workflow was found. Describe the trigger, actions, and connections or use a clearer diagram.',
  INVALID_DIAGRAM_FILE: 'Use a PNG, JPG, or PDF whose content matches its file type, up to 10 MB.',
  PAYLOAD_TOO_LARGE: 'The diagram is too large to parse. Use a file up to 10 MB.',
  INVALID_REQUEST: 'Check your description and diagram. Descriptions allow 4,000 characters and files up to 10 MB.',
}

async function encodeAttachment(file: File): Promise<ParseAttachment> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const pieces: string[] = []
  for (let index = 0; index < bytes.length; index += 32768) pieces.push(String.fromCharCode(...bytes.subarray(index, index + 32768)))
  const extension = file.name.split('.').pop()?.toLowerCase()
  const mimeType = extension === 'pdf' ? 'application/pdf' : extension === 'png' ? 'image/png' : 'image/jpeg'
  return { name: file.name, mimeType, data: btoa(pieces.join('')) }
}

export async function parseWorkflow(prompt: string, file: File | null, signal: AbortSignal): Promise<ParseWorkflowResponse> {
  const prepared = prepareIngestionDraft(prompt, file)
  if (!prepared.ok) throw new Error(prepared.error)
  const attachment = file ? await encodeAttachment(file) : undefined
  signal.throwIfAborted()
  let response: Response
  try {
    response = await fetch('/api/parse', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
      signal: AbortSignal.any([signal, AbortSignal.timeout(110000)]),
      body: JSON.stringify({ prompt: prepared.draft.prompt, ...(attachment ? { attachment } : {}) }),
    })
  } catch (error) {
    if (signal.aborted) throw error
    throw new Error('Cannot reach the parser or the request timed out. Check the backend; a request may already have reached Muse before retrying.')
  }
  const data = await response.json().catch(() => null) as ParseWorkflowResponse & { error?: { code?: string } } | null
  if (!response.ok) throw new Error(errors[data?.error?.code ?? ''] ?? 'The backend could not parse this workflow. Please try again later.')
  if (!data || data.model !== MUSE_PARSE_MODEL || !data.draft?.diagram?.nodes?.length || !Array.isArray(data.draft.diagram.edges)
    || !data.draft.plan?.steps?.length || !Array.isArray(data.draft.plan.edges) || data.draft.plan.sourceDiagramId !== data.draft.diagram.id) {
    throw new Error('The parser returned an unexpected result. No workflow has been replaced.')
  }
  return data
}
