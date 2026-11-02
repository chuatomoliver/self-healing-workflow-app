import { MUSE_PARSE_MODEL } from '../../../shared/parsing.ts'
import { ApiError } from '../errors.ts'
import { loadMuseKey } from './credential-store.ts'
import { museOutputSchema } from './output-schema.ts'

export type MuseResponseDetails = {
  operation: string; httpStatus: number; providerRequestId?: string
  inputTokens?: number; outputTokens?: number; reasoningTokens?: number
  responseStatus?: string
}
type MuseReply = {
  status?: unknown; output?: unknown; incomplete_details?: { reason?: unknown }
  usage?: { input_tokens?: unknown; output_tokens?: unknown; output_tokens_details?: { reasoning_tokens?: unknown } }
}
export type MuseTransportOptions = {
  getKey?: () => Promise<string | undefined>; send?: typeof fetch
  onResponse?: (details: MuseResponseDetails) => void
}
const invalidReply = () => new ApiError(502, 'MUSE_INVALID_RESPONSE', 'Muse could not produce a valid workflow response. Review your input before trying again.')

async function readJson(response: Response): Promise<unknown> {
  if (!response.body) throw invalidReply()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 512 * 1024) { await reader.cancel(); throw invalidReply() }
      chunks.push(value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } finally { reader.releaseLock() }
}

export function createMuseJsonRequest(options: MuseTransportOptions = {}) {
  return async (content: Record<string, unknown>[], name: string, schema: Record<string, unknown>, instructions: string, callerSignal: AbortSignal, reasoningEffort: 'minimal' | 'low' = 'low'): Promise<unknown> => {
    let key: string | undefined
    try { key = await (options.getKey ?? loadMuseKey)() }
    catch { throw new ApiError(503, 'MUSE_KEY_STORAGE_UNAVAILABLE', 'Cannot read the saved Muse key. Check the backend Windows account or supply MODEL_API_KEY.') }
    if (!key) throw new ApiError(503, 'MUSE_NOT_CONFIGURED', 'Set up the Muse key with npm.cmd run muse:setup in the backend folder.')
    const signal = AbortSignal.any([callerSignal, AbortSignal.timeout(90000)])
    try {
      const response = await (options.send ?? fetch)('https://api.meta.ai/v1/responses', {
        method: 'POST', redirect: 'error', signal,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MUSE_PARSE_MODEL, store: false, max_output_tokens: 8192, reasoning: { effort: reasoningEffort }, instructions,
          input: [{ role: 'user', content }], text: { format: { type: 'json_schema', name, strict: true, schema: museOutputSchema(schema) } },
        }),
      })
      let payload: MuseReply | null = null
      try {
        if (!response.ok) {
          await response.body?.cancel()
          if ([401, 403].includes(response.status)) throw new ApiError(503, 'MUSE_AUTH_FAILED', 'Muse rejected the configured key or model access.')
          if (response.status === 402) throw new ApiError(503, 'MUSE_BILLING_REQUIRED', 'Check billing in the Meta developer dashboard.')
          if (response.status === 404) throw new ApiError(503, 'MUSE_MODEL_UNAVAILABLE', 'The configured Muse model or endpoint is unavailable. Check model access and configuration.')
          if (response.status === 429) throw new ApiError(429, 'MUSE_RATE_LIMITED', 'Muse usage or rate limit reached. Check your quota before trying again.')
          if ([400, 413, 422].includes(response.status)) throw new ApiError(502, 'MUSE_INPUT_REJECTED', 'Muse could not process this input. Review the description and configuration.')
          throw new ApiError(502, 'MUSE_UNAVAILABLE', 'Muse returned a server error. No workflow was generated. Try again later.')
        }
        payload = await readJson(response) as MuseReply | null
      } finally {
        const requestId = response.headers.get('x-request-id')
        const tokenCount = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
        const details: MuseResponseDetails = {
          operation: name, httpStatus: response.status,
          providerRequestId: requestId && /^[A-Za-z0-9_-]{8,128}$/.test(requestId) && !requestId.includes(key) ? requestId : undefined,
          inputTokens: tokenCount(payload?.usage?.input_tokens), outputTokens: tokenCount(payload?.usage?.output_tokens),
          reasoningTokens: tokenCount(payload?.usage?.output_tokens_details?.reasoning_tokens),
          responseStatus: ['completed', 'incomplete', 'failed'].includes(String(payload?.status)) ? String(payload?.status) : undefined,
        }
        // Only allowlisted metadata is reported; never bodies, prompts, credentials, or raw errors.
        try { options.onResponse?.(details) } catch { /* Diagnostic failure must not repeat a paid request. */ }
      }
      if (payload?.status === 'incomplete' && payload.incomplete_details?.reason === 'max_output_tokens') {
        throw new ApiError(502, 'MUSE_OUTPUT_LIMIT', 'Muse reached its output limit before finishing. No workflow was generated. Try a smaller workflow; no automatic retry was made.')
      }
      if (payload?.status === 'incomplete') {
        throw new ApiError(502, 'MUSE_INCOMPLETE', 'Muse could not produce a valid workflow response because generation did not finish. No automatic retry was made.')
      }
      if (payload?.status !== 'completed' || !Array.isArray(payload.output)) throw invalidReply()
      const texts: string[] = []
      for (const item of payload.output) {
        if (!item || item.type !== 'message' || !Array.isArray(item.content)) continue
        for (const part of item.content) {
          if (part?.type === 'refusal') throw invalidReply()
          if (part?.type === 'output_text' && typeof part.text === 'string') texts.push(part.text)
        }
      }
      if (texts.length !== 1) throw invalidReply()
      return JSON.parse(texts[0]) as unknown
    } catch (error) {
      if (signal.aborted) throw new ApiError(504, 'MUSE_TIMEOUT', 'The request was cancelled or timed out. It may already have reached Muse; review before trying again.')
      if (error instanceof ApiError) throw error
      throw invalidReply()
    }
  }
}
