import assert from 'node:assert/strict'
import test from 'node:test'
import { runMuseCommand, testMuseConnection } from '../scripts/test-muse.ts'
import { loadMuseKey } from '../src/muse/credential-store.ts'
import type { MuseCredentialStore } from '../src/muse/credential-store.ts'

const env = { MODEL_API_KEY: 'test-only-secret' }
const reply = { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Muse connection successful' }] }] }

test('Muse test uses one fixed HTTPS request and does not send application content', async () => {
  let calls = 0
  await testMuseConnection(env, async (url, options) => {
    calls++
    assert.equal(url, 'https://api.meta.ai/v1/responses')
    assert.equal(options?.redirect, 'error')
    assert.equal(new Headers(options?.headers).get('Authorization'), `Bearer ${env.MODEL_API_KEY}`)
    assert.deepEqual(JSON.parse(String(options?.body)), {
      model: 'muse-spark-1.3', input: 'Reply with exactly: Muse connection successful', max_output_tokens: 1024, store: false,
    })
    assert.ok(options?.signal instanceof AbortSignal)
    return Response.json(reply)
  })
  assert.equal(calls, 1)
})

test('Muse test fails before a request when no key is configured', async () => {
  await assert.rejects(testMuseConnection({}, async () => { assert.fail('Must not call the API') }), /No Muse key/)
})

test('Muse failures do not expose provider error bodies or reflected credentials', async () => {
  for (const status of [400, 401, 402, 403, 404, 429, 500]) {
    let calls = 0
    await assert.rejects(testMuseConnection(env, async () => {
      calls++
      return new Response(env.MODEL_API_KEY, { status })
    }), (error: unknown) => error instanceof Error && !error.message.includes(env.MODEL_API_KEY))
    assert.equal(calls, 1)
  }
  await assert.rejects(testMuseConnection(env, async () => { throw new Error(env.MODEL_API_KEY) }), /Cannot reach Muse/)
})

test('Muse test requires a completed expected reply and handles invalid JSON', async () => {
  for (const payload of [null, {}, { ...reply, status: 'incomplete' }, { status: 'completed', output: [null, { type: 'message', content: [null] }] }]) {
    await assert.rejects(testMuseConnection(env, async () => Response.json(payload)), /did not complete/)
  }
  await assert.rejects(testMuseConnection(env, async () => new Response('invalid JSON')), /unreadable response/)
})

function memoryStore(initial?: string): MuseCredentialStore {
  let saved = initial
  return { read: async () => saved, write: async (key) => { saved = key }, remove: async () => { saved = undefined } }
}

test('saved Muse keys are reused and explicit environment configuration takes precedence', async () => {
  const store = memoryStore('saved-test-key')
  assert.equal(await loadMuseKey({}, store), 'saved-test-key')
  assert.equal(await loadMuseKey({ MODEL_API_KEY: ' environment-test-key ' }, { ...store, read: async () => { assert.fail('Must not read saved key') } }), 'environment-test-key')
  let calls = 0
  const message = await runMuseCommand([], {
    env: {}, store,
    prompt: async () => { assert.fail('Must not prompt when the key is saved') },
    send: async (_url, options) => {
      calls++
      assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer saved-test-key')
      return Response.json(reply)
    },
  })
  assert.equal(calls, 1)
  assert.match(message, /Muse connection successful/)
  assert.ok(!message.includes('saved-test-key'))
})

test('one-time setup saves only a validated key and preserves it after a failed replacement', { skip: process.platform !== 'win32' }, async () => {
  const store = memoryStore('previous-test-key')
  await assert.rejects(runMuseCommand(['--save'], {
    store, prompt: async () => 'bad-test-key', send: async () => new Response('failure', { status: 401 }),
  }), /rejected the API key/)
  assert.equal(await store.read(), 'previous-test-key')
  const message = await runMuseCommand(['--save'], {
    store, prompt: async () => ' new-test-key ', send: async () => Response.json(reply),
  })
  assert.equal(await store.read(), 'new-test-key')
  assert.match(message, /Key saved/)
  assert.ok(!message.includes('new-test-key'))
})

test('forgetting a saved key makes no API call and a temporary test never saves its key', async () => {
  const store = memoryStore('saved-test-key')
  await runMuseCommand(['--prompt'], { store, prompt: async () => 'temporary-test-key', send: async () => Response.json(reply) })
  assert.equal(await store.read(), 'saved-test-key')
  await runMuseCommand(['--forget'], { store, send: async () => { assert.fail('Must not call the API') } })
  assert.equal(await store.read(), undefined)
  await assert.rejects(runMuseCommand([], { env: {}, store, send: async () => { assert.fail('Must not call the API') } }), /No Muse key/)
})
