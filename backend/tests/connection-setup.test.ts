import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:http'
import { createHmac, randomUUID } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WebhookConnection, WebhookConnectionRequest } from '../../shared/connections.ts'
import type { SavedWorkflow } from '../../shared/workflows.ts'
import type { DeliveryRepository, StoredDelivery } from '../src/webhooks/repository.ts'
import type { WorkflowRepository } from '../src/workflows/repository.ts'
import { createWebhookCredentialStore } from '../src/webhooks/credentials.ts'
import { createWebhookSetup, parseStoredWebhook } from '../src/webhooks/setup.ts'
import { loadConnections } from '../src/webhooks/connections.ts'
import { createWebhookDeliveryService } from '../src/webhooks/service.ts'
import { readDestinationPolicy } from '../src/webhooks/destination.ts'
import { buildApp } from '../src/app.ts'
import { draftFixture } from './fixtures.ts'
import { connectWebhook } from '../../frontend/src/features/workflows/connectionSetup.ts'

async function storage(t: test.TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'metaflow-connections-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const env = { NODE_ENV: 'test', WEBHOOK_CONNECTIONS_FILE: join(directory, 'connections.json'), WEBHOOK_SECRETS_DIR: join(directory, 'secrets') }
  const credentialStore = (reference: string) => createWebhookCredentialStore(reference, env, 'linux')
  return { env, credentialStore }
}
function harness(connection: WebhookConnection) {
  const draft = draftFixture()
  draft.plan = connectWebhook(draft.plan, 'notify', connection)
  const workflow: SavedWorkflow = { ...draft, id: randomUUID(), version: 1, createdAt: '', updatedAt: '' }
  const repository: WorkflowRepository = { health: async () => {}, list: async () => [], get: async () => workflow,
    create: async (value) => ({ ...workflow, ...value }), update: async () => workflow }
  const records = new Map<string, StoredDelivery>()
  const deliveries: DeliveryRepository = {
    find: async (id) => records.get(id) ?? null,
    reserve: async (intent) => {
      const delivery = { id: intent.id, workflowId: workflow.id, workflowVersion: 1, webhookId: 'notify', status: 'pending' as const,
        httpStatus: null, durationMs: null, errorCode: null, createdAt: '', completedAt: null }
      records.set(intent.id, { delivery, fingerprint: intent.fingerprint }); return { delivery, created: true }
    },
    finish: async (id, result) => { const item = records.get(id)!; item.delivery = { ...item.delivery, ...result }; return item.delivery },
    list: async () => [...records.values()].map((item) => item.delivery),
  }
  return { workflow, repository, deliveries, records, request: { requestId: randomUUID(), expectedVersion: 1, sampleData: { request: { subject: 'Local test notification' } } } }
}
const input: WebhookConnectionRequest = { name: 'Test receiver', url: 'https://receiver.example.test/private-path-token?token=query-secret', mode: 'url', headerName: '', secret: '' }

test('private hosted credentials survive new store instances while URLs and keys stay out of catalogs and API responses', async (t) => {
  const { env, credentialStore } = await storage(t)
  const setup = createWebhookSetup({ env, credentialStore })
  const connection = await setup(input)
  const stored = await credentialStore(connection.id).read()
  assert.equal(JSON.parse(stored!).url, input.url)
  assert.ok(!(await readFile(env.WEBHOOK_CONNECTIONS_FILE, 'utf8')).includes('private-path-token'))
  const files = await readdir(env.WEBHOOK_SECRETS_DIR)
  assert.equal(files.length, 1)
  if (process.platform !== 'win32') {
    assert.equal((await stat(join(env.WEBHOOK_SECRETS_DIR, files[0]))).mode & 0o777, 0o600)
    assert.equal((await stat(env.WEBHOOK_SECRETS_DIR)).mode & 0o777, 0o700)
  }
  const h = harness(connection)
  const app = buildApp({ repository: h.repository, setupConnection: setup, connections: () => loadConnections(env) })
  t.after(() => app.close())
  const response = await app.inject({ method: 'POST', url: '/api/connections', payload: { ...input, mode: 'secret-header', headerName: 'Authorization', secret: 'Bearer test-only-secret' } })
  assert.equal(response.statusCode, 201)
  assert.ok(!/private-path-token|query-secret|test-only-secret/.test(response.body))
  assert.ok(!(await app.inject('/api/connections/configured')).body.includes('private-path-token'))
  assert.equal((await app.inject({ method: 'POST', url: '/api/connections', headers: { origin: 'https://attacker.test' }, payload: input })).statusCode, 403)
  assert.equal((await app.inject({ method: 'POST', url: '/api/connections', payload: { ...input, extra: 'field' } })).statusCode, 400)
})

test('saved URL-only, header, and signature webhooks pin their public destination and send the original mapped payload once', async (t) => {
  const { env, credentialStore } = await storage(t)
  for (const mode of ['url', 'secret-header', 'signature'] as const) {
    const connection = await createWebhookSetup({ env, credentialStore })({ ...input, mode, headerName: mode === 'url' ? '' : 'X-Token', secret: mode === 'url' ? '' : 'test-signing-key' })
    const h = harness(connection)
    let hits = 0
    const options = { workflows: h.repository, deliveries: h.deliveries, connections: () => loadConnections(env), policy: { allowedOrigins: [] },
      getSecret: (reference: string) => credentialStore(reference).read(), resolve: async () => [{ address: '93.184.216.34', family: 4 }],
      send: async (destination: { url: URL }, body: string, headers: Record<string, string>) => {
        hits++; assert.equal(destination.url.href, input.url)
        assert.deepEqual(JSON.parse(body), { subject: 'Local test notification' })
        assert.equal(headers['X-Token'], mode === 'url' ? undefined : mode === 'signature' ? `sha256=${createHmac('sha256', 'test-signing-key').update(body).digest('hex')}` : 'test-signing-key')
        return 200
      },
    }
    const service = createWebhookDeliveryService(options)
    assert.equal((await service.deliver(h.workflow.id, 'notify', h.request)).status, 'succeeded')
    await service.deliver(h.workflow.id, 'notify', h.request)
    assert.equal(hits, 1)
    assert.ok(!/private-path-token|query-secret|test-signing-key/.test(JSON.stringify([...h.records.values()])))
    const privateService = createWebhookDeliveryService({ ...options, resolve: async () => [{ address: '10.0.0.1', family: 4 }] })
    await assert.rejects(privateService.deliver(h.workflow.id, 'notify', { ...h.request, requestId: randomUUID() }))
    assert.equal(hits, 1)
  }
})

test('real local HTTP receiver accepts a saved webhook after reopening its private storage without contacting Slack or Muse', async (t) => {
  const { env, credentialStore } = await storage(t)
  let hits = 0
  const receiver = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk))
    assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()), { subject: 'Local test notification' })
    assert.equal(request.headers['x-test-token'], 'test-only-token')
    hits++; response.writeHead(200).end('ok')
  })
  await new Promise<void>((accept) => receiver.listen(0, '127.0.0.1', accept))
  t.after(() => new Promise<void>((accept, reject) => receiver.close((error) => error ? reject(error) : accept())))
  const address = receiver.address(); assert.ok(address && typeof address !== 'string')
  const localEnv = { ...env, WEBHOOK_LOCAL_RECEIVER_URL: `http://127.0.0.1:${address.port}/` }
  const connection = await createWebhookSetup({ env: localEnv, credentialStore })({ ...input, url: localEnv.WEBHOOK_LOCAL_RECEIVER_URL, mode: 'secret-header', headerName: 'X-Test-Token', secret: 'test-only-token' })
  const h = harness(connection)
  const service = createWebhookDeliveryService({ workflows: h.repository, deliveries: h.deliveries, connections: () => loadConnections(localEnv),
    policy: readDestinationPolicy(localEnv), getSecret: (reference) => createWebhookCredentialStore(reference, localEnv, 'linux').read() })
  assert.equal((await service.deliver(h.workflow.id, 'notify', h.request)).status, 'succeeded')
  await service.deliver(h.workflow.id, 'notify', h.request)
  assert.equal(hits, 1)
})

test('connection setup rejects dangerous authentication, stores Slack URLs privately, and removes orphan credentials after catalog failure', async (t) => {
  const { env, credentialStore } = await storage(t)
  for (const patch of [{ url: 'http://other.test/' }, { url: 'https://user:pass@receiver.example.test/' }, { url: `${input.url}#fragment` },
    { mode: 'secret-header', headerName: 'Host', secret: 'test' }, { mode: 'secret-header', headerName: 'X-Token', secret: 'test\r\ninjected' }])
    assert.throws(() => parseStoredWebhook({ url: input.url, mode: input.mode, headerName: '', secret: '', ...patch }))
  const slackUrl = 'https://hooks.slack.com/services/T_TEST/B_TEST/TEST_ONLY_SECRET'
  const slack = await createWebhookSetup({ env, credentialStore })({ ...input, url: slackUrl })
  assert.equal(slack.endpointUrl, 'https://hooks.slack.com/services')
  assert.ok(!JSON.stringify(slack).includes('TEST_ONLY_SECRET'))
  const app = buildApp({ repository: harness(slack).repository, connections: () => loadConnections(env) })
  t.after(() => app.close())
  const slackChoices = (await app.inject('/api/connections/slack')).json().connections
  assert.equal(slackChoices[0].connection.id, slack.id)
  assert.equal(slackChoices[0].channel, 'the channel selected in Slack')
  const h = harness(slack)
  h.workflow.plan.webhooks[0].payloadTemplate = { text: '{{request.subject}}' }
  h.workflow.plan.webhooks[0].setup = { endpointReviewed: true, authenticationReviewed: true, payloadReviewed: true }
  h.workflow.plan.steps[1].mappings = [{ source: 'request.subject', target: 'webhook.payload.text' }]
  let slackCalls = 0
  const delivery = createWebhookDeliveryService({ workflows: h.repository, deliveries: h.deliveries, policy: { allowedOrigins: [] }, connections: () => loadConnections(env),
    getSecret: (reference) => credentialStore(reference).read(), resolve: async () => [{ address: '93.184.216.34', family: 4 }],
    send: async (destination, body, headers) => {
      slackCalls++; assert.equal(destination.url.href, slackUrl)
      assert.deepEqual(JSON.parse(body), { text: 'Local test notification' })
      assert.equal(headers.Authorization, undefined)
      assert.equal(headers['X-Webhook-Reference'], undefined)
      return 200
    },
  })
  assert.equal((await delivery.deliver(h.workflow.id, 'notify', h.request)).status, 'succeeded')
  assert.equal(slackCalls, 1)
  h.workflow.plan.webhooks[0].payloadTemplate = { content: '{{request.subject}}' }
  h.workflow.plan.steps[1].mappings = [{ source: 'request.subject', target: 'webhook.payload.content' }]
  await assert.rejects(delivery.deliver(h.workflow.id, 'notify', { ...h.request, requestId: randomUUID() }))
  assert.equal(slackCalls, 1)
  const failed = createWebhookSetup({ env: { ...env, WEBHOOK_CONNECTIONS_FILE: env.WEBHOOK_SECRETS_DIR }, credentialStore })
  const before = await readdir(env.WEBHOOK_SECRETS_DIR)
  await assert.rejects(failed(input))
  assert.deepEqual(await readdir(env.WEBHOOK_SECRETS_DIR), before)
  assert.throws(() => createWebhookCredentialStore('../escape', env, 'linux'))
  assert.throws(() => createWebhookCredentialStore('valid', { WEBHOOK_SECRETS_DIR: process.cwd() }, 'linux'))
})
