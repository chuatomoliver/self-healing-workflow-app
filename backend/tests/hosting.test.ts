import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { buildApp } from '../src/app.ts'
import type { WorkflowRepository } from '../src/workflows/repository.ts'

const hosting = { origin: 'https://demo.example', username: 'team', password: 'test-password-sixteen-plus' }
const headers = { host: 'demo.example', authorization: `Basic ${Buffer.from(`${hosting.username}:${hosting.password}`).toString('base64')}` }
const repository: WorkflowRepository = {
  async health() {}, async list() { return [] },
  async create() { assert.fail('Unexpected write') }, async get() { assert.fail('Unexpected read') }, async update() { assert.fail('Unexpected write') },
}

test('hosted access requires a login, allows the configured domain, and rejects forged origins', async (t) => {
  const app = buildApp({ repository, hosting })
  t.after(() => app.close())
  const unauthenticated = await app.inject({ url: '/api/workflows', headers: { host: headers.host } })
  assert.equal(unauthenticated.statusCode, 401)
  assert.match(String(unauthenticated.headers['www-authenticate']), /^Basic /)
  assert.ok(!unauthenticated.body.includes(hosting.password))
  assert.equal((await app.inject({ url: '/api/workflows', headers: { ...headers, authorization: 'Basic wrong' } })).statusCode, 401)
  assert.deepEqual((await app.inject({ url: '/api/workflows', headers })).json(), { workflows: [] })
  assert.equal((await app.inject({ url: '/api/workflows', headers: { ...headers, origin: hosting.origin } })).statusCode, 200)
  for (const override of [
    { origin: 'https://attacker.example' }, { host: 'attacker.example' }, { 'sec-fetch-site': 'cross-site' },
    { host: 'attacker.example', 'x-forwarded-host': 'demo.example' },
    { origin: 'null' }, { origin: 'http://localhost:5173' },
  ]) assert.equal((await app.inject({ url: '/api/workflows', headers: { ...headers, ...override } })).statusCode, 403)
  assert.equal((await app.inject({ url: '/api/health', headers: { host: headers.host } })).statusCode, 200)
})

test('browser refreshes serve the frontend while API failures, missing assets, and secret files stay private', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'metaflow-hosting-'))
  const root = join(directory, 'dist')
  await mkdir(join(root, 'assets'), { recursive: true })
  await writeFile(join(root, 'index.html'), '<!doctype html><div id="root">demo shell</div>')
  await writeFile(join(root, 'assets', 'app.js'), 'console.log("frontend")')
  await writeFile(join(root, '.env'), 'MODEL_API_KEY=DO_NOT_SERVE')
  await writeFile(join(directory, 'private.txt'), 'OUTSIDE_DIST')
  const app = buildApp({ repository, hosting, frontendRoot: root })
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }) })
  for (const url of ['/', '/plan-workflow?workflow=123', '/run-on-canvas', '/context-and-logs']) {
    const response = await app.inject({ url, headers: { ...headers, accept: 'text/html' } })
    assert.equal(response.statusCode, 200, url)
    assert.match(response.body, /demo shell/)
    assert.match(String(response.headers['content-type']), /text\/html/)
    assert.match(String(response.headers['content-security-policy']), /script-src 'self'/)
    assert.equal(response.headers['cache-control'], 'no-store')
  }
  assert.equal((await app.inject({ url: '/run-on-canvas', headers: { host: headers.host, accept: 'text/html' } })).statusCode, 401)
  const asset = await app.inject({ url: '/assets/app.js', headers })
  assert.equal(asset.statusCode, 200)
  assert.match(String(asset.headers['content-type']), /javascript/)
  for (const url of ['/api/missing', '/api', '/assets/missing.js', '/assets/missing', '/.env', '/%2eenv', '/%2e%2e/private.txt', '/backend/src/server.ts']) {
    const response = await app.inject({ url, headers: { ...headers, accept: 'text/html' } })
    assert.ok(response.statusCode >= 400, url)
    assert.ok(!/demo shell|DO_NOT_SERVE|OUTSIDE_DIST/.test(response.body), url)
  }
  assert.equal((await app.inject({ method: 'POST', url: '/plan-workflow', headers })).statusCode, 404)

  const shared = { ...headers, accept: 'text/html', 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' }
  assert.equal((await app.inject({ url: '/?fbclid=abc', headers: shared })).statusCode, 200)
  assert.equal((await app.inject({ url: '/', headers: { ...shared, authorization: 'Basic wrong' } })).statusCode, 401)
  const blockedLinks: { method: 'GET' | 'POST'; url: string; headers?: Record<string, string> }[] = [
    { method: 'GET', url: '/api/workflows' }, { method: 'POST', url: '/' },
    { method: 'GET', url: '/', headers: { 'sec-fetch-dest': 'iframe' } }, { method: 'GET', url: '/', headers: { 'sec-fetch-mode': 'no-cors' } },
    { method: 'GET', url: '/assets/app.js', headers: { 'sec-fetch-dest': 'script', 'sec-fetch-mode': 'no-cors' } },
  ]
  for (const { method, url, headers: extra } of blockedLinks) {
    assert.equal((await app.inject({ method, url, headers: { ...shared, ...extra } })).statusCode, 403, `${method} ${url}`)
  }
})

test('hosted login and write attempts have bounded request rates without invoking AI', async (t) => {
  let calls = 0
  const app = buildApp({ repository, hosting, parse: async () => { calls++; assert.fail('AI must not run') } })
  t.after(() => app.close())
  for (let i = 0; i < 20; i++) assert.equal((await app.inject({ url: '/api/workflows', headers: { host: headers.host } })).statusCode, 401)
  const blocked = await app.inject({ url: '/api/workflows', headers: { host: headers.host } })
  assert.equal(blocked.statusCode, 429)
  assert.ok(Number(blocked.headers['retry-after']) > 0)
  assert.equal((await app.inject({ url: '/api/workflows', headers })).statusCode, 200)
  for (let i = 0; i < 30; i++) assert.equal((await app.inject({ method: 'POST', url: '/api/parse', headers, payload: {} })).statusCode, 400)
  assert.equal((await app.inject({ method: 'POST', url: '/api/parse', headers, payload: {} })).statusCode, 429)
  assert.equal((await app.inject({ method: 'POST', url: '/%61pi/parse', headers, payload: {} })).statusCode, 429)
  assert.equal(calls, 0)
})
