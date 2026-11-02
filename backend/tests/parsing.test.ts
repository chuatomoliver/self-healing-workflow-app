import assert from 'node:assert/strict'
import test from 'node:test'
import { buildApp } from '../src/app.ts'
import { ApiError } from '../src/errors.ts'
import { createMuseParser } from '../src/muse/parser.ts'
import type { WebhookSuggestion, WorkflowExtraction } from '../../shared/parsing.ts'
import type { WorkflowRepository } from '../src/workflows/repository.ts'

const extraction: WorkflowExtraction = {
  title: 'Order notifications', summary: 'Notify sales when an order arrives.',
  nodes: [
    { id: 'receive', label: 'Receive order', role: 'trigger', description: 'A new order arrives.', app: 'Shopify', reviewNote: '' },
    { id: 'notify', label: 'Notify sales', role: 'action', description: 'Send the order summary.', app: 'Slack', reviewNote: 'Which sales channel should receive the message?' },
  ], edges: [{ id: 'edge-1', source: 'receive', target: 'notify', label: '' }], webhooks: [],
}
const webhookSuggestions: WebhookSuggestion[] = [
  {
    id: 'order-intake', stepId: 'receive', name: 'Order intake', direction: 'incoming', event: 'order.created',
    purpose: 'Receive order events from the source.', suggestionReason: 'The trigger needs an external order event.',
    payloadFields: [{ name: 'order_id', source: 'order.id', description: 'Identifier of the new order.' }],
  },
  {
    id: 'sales-notification', stepId: 'notify', name: 'Sales notification', direction: 'outgoing', event: 'order.sales_notification',
    purpose: 'Deliver the order summary to a sales receiver.', suggestionReason: 'The action delivers the summary to an HTTP receiver.',
    payloadFields: [{ name: 'order_id', source: 'order.id', description: 'Order to include in the notification.' }],
  },
]
const repository: WorkflowRepository = {
  health: async () => {}, list: async () => [],
  get: async () => { throw new Error('Unexpected storage call') },
  create: async () => { throw new Error('Unexpected storage call') },
  update: async () => { throw new Error('Unexpected storage call') },
}
const envelope = (value: unknown = extraction) => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] })
const png = { name: 'diagram.png', mimeType: 'image/png' as const, data: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64') }

test('parse endpoint returns a validated graph and matching unsaved plan without storage or invented connections', async (t) => {
  let calls = 0
  const app = buildApp({ repository, parse: async (input) => { calls++; assert.equal(input.prompt, 'Notify sales for each order'); return extraction } })
  t.after(() => app.close())
  const response = await app.inject({ method: 'POST', url: '/api/parse', payload: { prompt: 'Notify sales for each order' } })
  assert.equal(response.statusCode, 200)
  const { draft, model } = response.json()
  assert.equal(model, 'muse-spark-1.3')
  assert.match(draft.diagram.id, /^parsed-/)
  assert.equal(draft.plan.sourceDiagramId, draft.diagram.id)
  assert.deepEqual(draft.plan.steps.map((step: { id: string }) => step.id), ['receive', 'notify'])
  assert.deepEqual(draft.plan.edges, draft.diagram.edges)
  assert.deepEqual(draft.plan.webhooks, [])
  assert.equal(draft.plan.questions[0].stepId, 'notify')
  assert.equal(draft.plan.steps[0].configuration.find((setting: { label: string }) => setting.label === 'Operation setup').needsInput, true)
  assert.ok(draft.diagram.nodes[1].position.x > draft.diagram.nodes[0].position.x)
  assert.equal(response.headers['cache-control'], 'no-store')
  assert.equal(calls, 1)
  // The generated data also passes the existing save schema and semantic checks.
  const validatorApp = buildApp({ repository: { ...repository, create: async (value) => ({ ...value, id: 'saved-id', version: 1, createdAt: '', updatedAt: '' }) } })
  t.after(() => validatorApp.close())
  assert.equal((await validatorApp.inject({ method: 'POST', url: '/api/workflows', payload: draft })).statusCode, 201)
})

test('rejects invalid text, extra properties, disguised files, and nonlocal origins before calling Muse', async (t) => {
  let calls = 0
  const app = buildApp({ repository, parse: async () => { calls++; return extraction } })
  t.after(() => app.close())
  for (const payload of [
    {}, { prompt: '' }, { prompt: '   ' }, { prompt: 42 }, { prompt: 'x'.repeat(4001) }, { prompt: 'Order flow', apiKey: 'do-not-leak' },
    { prompt: '', attachment: { ...png, data: Buffer.from('not an image').toString('base64') } },
    { prompt: '', attachment: { ...png, name: 'script.exe' } },
    { prompt: '', attachment: { ...png, data: `${png.data}\n` } },
    { prompt: '', attachment: { ...png, url: 'https://example.test/private' } },
  ]) {
    const result = await app.inject({ method: 'POST', url: '/api/parse', payload })
    assert.equal(result.statusCode, 400)
    assert.ok(!result.body.includes('do-not-leak'))
  }
  assert.equal((await app.inject({ method: 'POST', url: '/api/parse', headers: { origin: 'https://example.test' }, payload: { prompt: 'Orders' } })).statusCode, 403)
  assert.equal(calls, 0)
  assert.equal((await app.inject({ method: 'POST', url: '/api/parse', payload: { prompt: '', attachment: png } })).statusCode, 200)
  assert.equal(calls, 1)
})

test('Muse webhook suggestions link to matching steps and stay inert, reviewable, and saveable', async (t) => {
  const app = buildApp({ repository: { ...repository, create: async (draft) => ({ ...draft, id: 'saved', version: 1, createdAt: '', updatedAt: '' }) },
    parse: async () => ({ ...extraction, webhooks: webhookSuggestions }),
  })
  t.after(() => app.close())
  const parsed = await app.inject({ method: 'POST', url: '/api/parse', payload: { prompt: 'Receive orders and notify a sales webhook receiver.' } })
  assert.equal(parsed.statusCode, 200)
  const { draft } = parsed.json()
  assert.equal(draft.plan.webhooks.length, 2)
  const [incoming, outgoing] = draft.plan.webhooks
  assert.equal(incoming.suggestedBy, 'muse')
  assert.equal(new URL(incoming.endpoint.urlTemplate).hostname, 'api.example.invalid')
  assert.equal(new URL(outgoing.endpoint.urlTemplate).hostname, 'hooks.example.invalid')
  assert.deepEqual(outgoing.payloadTemplate, { order_id: '{{order.id}}' })
  assert.equal(draft.plan.steps[0].webhookTemplateId, incoming.id)
  assert.equal(draft.plan.steps[1].webhookTemplateId, outgoing.id)
  assert.deepEqual(draft.plan.steps[1].mappings, [{ source: 'order.id', target: 'webhook.payload.order_id' }])
  assert.deepEqual(draft.plan.steps[0].mappings, [{ source: 'webhook.payload.order_id', target: 'order.id' }])
  assert.equal(draft.plan.steps[0].outputs[0].name, 'order_id')
  assert.equal(draft.plan.steps[1].inputs[0].name, 'order_id')
  assert.equal(draft.plan.checks.find((check: { id: string }) => check.id === 'webhooks').status, 'needs-input')
  assert.ok(outgoing.suggestionReason.includes('receiver'))
  assert.equal((await app.inject({ method: 'POST', url: '/api/workflows', payload: draft })).statusCode, 201)
  for (const change of [
    (value: typeof draft) => { value.plan.webhooks[0].endpoint.urlTemplate = 'http://real-receiver.example.test/hook' },
    (value: typeof draft) => { value.plan.webhooks[0].payloadTemplate.order_id = 'secret-value' },
    (value: typeof draft) => { value.plan.webhooks[0].payloadTemplate = {} },
    (value: typeof draft) => { delete value.plan.steps[0].webhookTemplateId },
    (value: typeof draft) => { value.plan.edges = [] },
  ]) {
    const modified = structuredClone(draft)
    change(modified)
    assert.equal((await app.inject({ method: 'POST', url: '/api/workflows', payload: modified })).statusCode, 400)
  }
})

test('rejects invented URLs/credentials, unknown or wrong-role steps, and ambiguous webhook mappings', async (t) => {
  const incoming = webhookSuggestions[0]
  for (const webhooks of [
    [{ ...incoming, stepId: 'missing' }], [{ ...incoming, direction: 'outgoing' }],
    [{ ...incoming, stepId: 'notify' }], [incoming, incoming], [incoming, { ...incoming, id: 'duplicate-step' }],
    [{ ...incoming, endpoint: 'https://do-not-fetch.example.test' }], [{ ...incoming, apiKey: 'do-not-leak' }],
    [{ ...incoming, payloadFields: [...incoming.payloadFields, incoming.payloadFields[0]] }],
    [{ ...incoming, payloadFields: [{ name: 'id', source: 'literal-secret', description: '' }] }],
    [{ ...incoming, suggestionReason: '   ' }],
  ]) {
    const app = buildApp({ repository, parse: async () => ({ ...extraction, webhooks }) })
    t.after(() => app.close())
    const response = await app.inject({ method: 'POST', url: '/api/parse', payload: { prompt: 'Order webhook' } })
    assert.equal(response.statusCode, 502)
    assert.equal(response.json().error.code, 'MUSE_INVALID_RESPONSE')
    assert.ok(!response.body.includes('do-not-leak'))
    assert.ok(!response.body.includes('do-not-fetch'))
  }
})

test('invalid AI shapes, cycles, duplicate IDs, and missing references never become a draft', async (t) => {
  for (const bad of [
    {}, { ...extraction, secret: 'do-not-leak' },
    { ...extraction, nodes: [...extraction.nodes, extraction.nodes[0]] },
    { ...extraction, edges: [{ ...extraction.edges[0], target: 'missing' }] },
    { ...extraction, edges: [...extraction.edges, { id: 'cycle', source: 'notify', target: 'receive', label: '' }] },
  ]) {
    const app = buildApp({ repository, parse: async () => bad })
    t.after(() => app.close())
    const result = await app.inject({ method: 'POST', url: '/api/parse', payload: { prompt: 'Orders' } })
    assert.equal(result.statusCode, 502)
    assert.equal(result.json().error.code, 'MUSE_INVALID_RESPONSE')
    assert.ok(!result.body.includes('do-not-leak'))
  }
  const app = buildApp({ repository, parse: async () => ({ ...extraction, nodes: [], edges: [] }) })
  t.after(() => app.close())
  assert.equal((await app.inject({ method: 'POST', url: '/api/parse', payload: { prompt: 'Hello there' } })).statusCode, 422)
})

test('one active parse is allowed and failure releases the slot', async (t) => {
  let release!: (value: unknown) => void
  let entered!: () => void
  const started = new Promise<void>((resolve) => { entered = resolve })
  const app = buildApp({ repository, parse: async () => { entered(); return new Promise((resolve) => { release = resolve }) } })
  t.after(() => app.close())
  const first = app.inject({ method: 'POST', url: '/api/parse', payload: { prompt: 'Orders' } }).then((value) => value)
  await started
  const busy = await app.inject({ method: 'POST', url: '/api/parse', payload: { prompt: 'Orders again' } })
  assert.equal(busy.statusCode, 429)
  assert.equal(busy.json().error.code, 'PARSE_BUSY')
  release({})
  assert.equal((await first).statusCode, 502)
  const nextStarted = new Promise<void>((resolve) => { entered = resolve })
  const next = app.inject({ method: 'POST', url: '/api/parse', payload: { prompt: 'Orders' } }).then((value) => value)
  await nextStarted
  release(extraction)
  assert.equal((await next).statusCode, 200)
})

test('Muse transport uses saved server key, strict structured output, and inline image/PDF inputs with no retries', async () => {
  for (const attachment of [undefined, png,
    { name: 'diagram.jpg', mimeType: 'image/jpeg' as const, data: Buffer.from([255, 216, 255, 224]).toString('base64') },
    { name: 'diagram.pdf', mimeType: 'application/pdf' as const, data: Buffer.from('%PDF-1.7 test').toString('base64') },
  ]) {
    let calls = 0
    const parse = createMuseParser({ getKey: async () => 'server-test-key', send: async (url, options) => {
      calls++
      assert.equal(url, 'https://api.meta.ai/v1/responses')
      assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer server-test-key')
      assert.equal(options?.redirect, 'error')
      const body = JSON.parse(String(options?.body))
      assert.equal(body.text.format.type, 'json_schema')
      assert.equal(body.text.format.strict, true)
      assert.ok(body.text.format.schema.required.includes('webhooks'))
      assert.ok(body.instructions.includes('An ordinary native API/OAuth action is not automatically a webhook'))
      assert.equal(body.store, false)
      assert.equal(body.max_output_tokens, 8192)
      assert.deepEqual(body.reasoning, { effort: 'minimal' })
      assert.equal(body.text.format.schema.properties.title.pattern, undefined)
      assert.equal(body.text.format.schema.properties.nodes.maxItems, undefined)
      assert.ok(!String(options?.body).includes('server-test-key'))
      const parts = body.input[0].content
      if (attachment) {
        const field = attachment.mimeType === 'application/pdf' ? 'file_data' : 'image_url'
        assert.equal(parts[1][field], `data:${attachment.mimeType};base64,${attachment.data}`)
      } else assert.equal(parts.length, 1)
      return Response.json(envelope())
    } })
    assert.deepEqual(await parse({ prompt: 'Orders', ...(attachment ? { attachment } : {}) }, new AbortController().signal), extraction)
    assert.equal(calls, 1)
  }
})

test('simplified Muse decoding still rejects invalid patterns and bounds before returning a draft', async (t) => {
  for (const bad of [
    { ...extraction, title: '   ' },
    { ...extraction, title: 'x'.repeat(201) },
    { ...extraction, nodes: Array.from({ length: 41 }, (_, i) => ({ ...extraction.nodes[0], id: `step-${i}` })), edges: [] },
    { ...extraction, webhooks: [{ ...webhookSuggestions[0], payloadFields: [{ name: 'order_id', source: 'literal-value', description: '' }] }] },
  ]) {
    let calls = 0
    const app = buildApp({ repository, parse: createMuseParser({ getKey: async () => 'test-key', send: async () => {
      calls++
      return Response.json(envelope(bad))
    } }) })
    t.after(() => app.close())
    const result = await app.inject({ method: 'POST', url: '/api/parse', payload: { prompt: 'Orders' } })
    assert.equal(result.statusCode, 502)
    assert.equal(result.json().error.code, 'MUSE_INVALID_RESPONSE')
    assert.equal(calls, 1)
  }
})

test('output exhaustion is distinct from a provider error and never returns a partial draft or retries', async (t) => {
  for (const [status, body, code] of [
    [200, { ...envelope(), status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }, 'MUSE_OUTPUT_LIMIT'],
    [200, { status: 'incomplete', output: [] }, 'MUSE_INCOMPLETE'],
    [500, { error: { message: 'private-key and private prompt' } }, 'MUSE_UNAVAILABLE'],
  ] as const) {
    let calls = 0
    const app = buildApp({ repository, parse: createMuseParser({ getKey: async () => 'private-key', send: async () => {
      calls++
      return Response.json(body, { status })
    } }) })
    t.after(() => app.close())
    const result = await app.inject({ method: 'POST', url: '/api/parse', payload: { prompt: 'private prompt' } })
    assert.equal(result.statusCode, 502)
    assert.equal(result.json().error.code, code)
    assert.equal(result.json().draft, undefined)
    assert.ok(!result.body.includes('private'))
    assert.equal(calls, 1)
  }
})

test('Muse errors, malformed output, and timeout are sanitized without leaking credentials or input', async () => {
  const failIfCalled: typeof fetch = async () => { assert.fail('Must not call Muse') }
  await assert.rejects(createMuseParser({ getKey: async () => undefined, send: failIfCalled })({ prompt: 'Orders' }, new AbortController().signal), (e: unknown) => e instanceof ApiError && e.code === 'MUSE_NOT_CONFIGURED')
  for (const status of [400, 401, 402, 403, 404, 429, 500]) {
    let calls = 0
    const parse = createMuseParser({ getKey: async () => 'private-test-key', send: async () => { calls++; return new Response('private-test-key', { status }) } })
    await assert.rejects(parse({ prompt: 'private input' }, new AbortController().signal), (e: unknown) => e instanceof ApiError && !e.message.includes('private'))
    assert.equal(calls, 1)
  }
  for (const body of [null, { status: 'incomplete', output: [] }, { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal' }] }] }]) {
    const parse = createMuseParser({ getKey: async () => 'key', send: async () => Response.json(body) })
    await assert.rejects(parse({ prompt: 'Orders' }, new AbortController().signal), /valid workflow/)
  }
  for (const body of ['{broken', 'x'.repeat(513 * 1024), JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{broken' }] }] })]) {
    const parse = createMuseParser({ getKey: async () => 'key', send: async () => new Response(body) })
    await assert.rejects(parse({ prompt: 'Orders' }, new AbortController().signal), /valid workflow/)
  }
  const controller = new AbortController()
  controller.abort()
  const parse = createMuseParser({ getKey: async () => 'key', send: async (_url, options) => { options?.signal?.throwIfAborted(); return Response.json(envelope()) } })
  await assert.rejects(parse({ prompt: 'Orders' }, controller.signal), (e: unknown) => e instanceof ApiError && e.code === 'MUSE_TIMEOUT')
})
