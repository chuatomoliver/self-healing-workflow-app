import assert from 'node:assert/strict'
import test from 'node:test'
import { createMuseJsonRequest } from '../src/muse/client.ts'
import type { MuseResponseDetails } from '../src/muse/client.ts'
import { museOutputSchema } from '../src/muse/output-schema.ts'
import { planningSchema } from '../src/muse/planning.ts'

const schema = { type: 'object', properties: { pattern: { type: 'string', minLength: 1, pattern: '^ok$' } }, required: ['pattern'], additionalProperties: false }
const reply = { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"pattern":"ok"}' }] }] }

test('schema projection preserves field names, enums, and strict objects without mutating local validation', () => {
  const original = structuredClone(schema)
  assert.deepEqual(museOutputSchema(schema), { ...schema, properties: { pattern: { type: 'string' } } })
  assert.deepEqual(schema, original)
  const planningOriginal = structuredClone(planningSchema)
  const projected = museOutputSchema(planningSchema)
  const properties = projected.properties as Record<string, any>
  assert.deepEqual(properties.steps.items.properties.role.enum, ['trigger', 'transform', 'decision', 'action'])
  assert.equal(properties.steps.items.additionalProperties, false)
  assert.equal(properties.steps.items.properties.configuration.items.properties.value.maxLength, undefined)
  assert.deepEqual(planningSchema, planningOriginal)
})

test('response diagnostics allow only counts, status, and request ID, excluding bodies and secrets', async () => {
  const reports: MuseResponseDetails[] = []
  const request = createMuseJsonRequest({ getKey: async () => 'private-key', onResponse: (details) => reports.push(details), send: async () => Response.json({
    ...reply, secret: 'private-key', echoed_prompt: 'private-prompt',
    usage: { input_tokens: 20, output_tokens: 205, output_tokens_details: { reasoning_tokens: 191 } },
  }, { headers: { 'x-request-id': 'bc678448-14bb-4445-8818-1be3d86c5de3' } }) })
  assert.deepEqual(await request([{ type: 'input_text', text: 'private-prompt' }], 'workflow_plan', schema, 'Instructions', new AbortController().signal), { pattern: 'ok' })
  assert.deepEqual(reports, [{ operation: 'workflow_plan', httpStatus: 200, providerRequestId: 'bc678448-14bb-4445-8818-1be3d86c5de3', inputTokens: 20, outputTokens: 205, reasoningTokens: 191, responseStatus: 'completed' }])
  assert.ok(!JSON.stringify(reports).includes('private'))
})

test('provider failures report no raw error body and diagnostic failures never repeat generation', async () => {
  for (const status of [200, 500]) {
    let calls = 0
    const reports: MuseResponseDetails[] = []
    const request = createMuseJsonRequest({ getKey: async () => 'private-key', onResponse: (details) => { reports.push(details); throw new Error('Observer failed') }, send: async () => {
      calls++
      return Response.json(status === 200 ? { ...reply, usage: { input_tokens: -1, output_tokens: 'private-key' } } : { error: { message: 'private-key private-prompt' } }, { status, headers: { 'x-request-id': 'private-key' } })
    } })
    const result = request([], 'workflow_plan', schema, 'private-prompt', new AbortController().signal)
    if (status === 200) assert.deepEqual(await result, { pattern: 'ok' })
    else await assert.rejects(result, /server error/)
    assert.equal(calls, 1)
    assert.equal(reports.length, 1)
    assert.equal(reports[0].providerRequestId, undefined)
    assert.equal(reports[0].inputTokens, undefined)
    assert.equal(reports[0].outputTokens, undefined)
    assert.ok(!JSON.stringify(reports).includes('private'))
  }
})
