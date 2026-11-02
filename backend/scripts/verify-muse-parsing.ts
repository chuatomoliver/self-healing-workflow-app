import assert from 'node:assert/strict'
import { buildApp } from '../src/app.ts'
import { loadMuseKey } from '../src/muse/credential-store.ts'
import { createMuseParser } from '../src/muse/parser.ts'
import type { WorkflowRepository } from '../src/workflows/repository.ts'

// Exercises the real HTTP handler and Muse, without touching a database or uploaded files.
const noStorage = async (): Promise<never> => { throw new Error('Storage is not used by the parsing check.') }
const repository: WorkflowRepository = { health: noStorage, list: noStorage, get: noStorage, create: noStorage, update: noStorage }
let app: ReturnType<typeof buildApp> | undefined
try {
  const key = await loadMuseKey()
  if (!key) throw new Error('No saved Muse key. Run npm.cmd run muse:setup first.')
  app = buildApp({ repository, parse: createMuseParser({ getKey: async () => key }) })
  console.log('Checking one real Muse parsing request using a fixed order-notification description. API usage charges may apply.')
  const response = await app.inject({ method: 'POST', url: '/api/parse', payload: {
    prompt: 'When a new order arrives in Shopify, create a deal in HubSpot, then notify the sales team in Slack.',
  } })
  if (response.statusCode !== 200) {
    const code: unknown = response.json().error?.code
    throw new Error(`Muse parsing check failed (HTTP ${response.statusCode}, ${typeof code === 'string' && /^[A-Z_]+$/.test(code) ? code : 'UNKNOWN'}).`)
  }
  const { draft, model } = response.json()
  assert.equal(model, 'muse-spark-1.3')
  assert.ok(draft.diagram.nodes.length > 0)
  assert.equal(draft.plan.steps.length, draft.diagram.nodes.length)
  console.log(`Muse parsing passed: ${draft.diagram.nodes.length} nodes, ${draft.diagram.edges.length} connections, ${draft.plan.webhooks.length} webhook suggestions, matching unsaved draft. No database writes.`)
} catch (error) {
  // Only our safe messages or a fixed assertion failure are displayed, never provider content.
  console.error(error instanceof assert.AssertionError ? 'The parsed draft did not pass verification.' : error instanceof Error ? error.message : 'Muse parsing check failed.')
  process.exitCode = 1
} finally { await app?.close() }
