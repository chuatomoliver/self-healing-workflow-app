import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import type { RowDataPacket } from 'mysql2/promise'
import type { SavedWorkflow } from '../../shared/workflows.ts'
import { buildApp } from '../src/app.ts'
import { createPool, migrate } from '../src/database.ts'
import { mysqlWorkflows } from '../src/workflows/repository.ts'
import { draftFixture } from './fixtures.ts'

test('real MySQL: migrations, restart persistence, version history, rollback, and concurrent saves', { skip: !process.env.TEST_DATABASE_URL }, async (t) => {
  const config = { databaseUrl: process.env.TEST_DATABASE_URL!, databaseSsl: false }
  const pool = createPool(config)
  t.after(() => pool.end())
  await Promise.all([migrate(pool), migrate(pool)])
  await migrate(pool)
  const [migrations] = await pool.execute<RowDataPacket[]>('SELECT name FROM schema_migrations ORDER BY name')
  assert.equal(migrations.length, 2)
  const app = buildApp({ repository: mysqlWorkflows(pool) })
  t.after(() => app.close())
  const draft = draftFixture()
  draft.plan.title = "🧭 Customer's support plan; DROP TABLE workflows; --"
  const created = await app.inject({ method: 'POST', url: '/api/workflows', payload: draft })
  assert.equal(created.statusCode, 201)
  const first = created.json<{ workflow: SavedWorkflow }>().workflow
  assert.deepEqual(first.plan, draft.plan)
  // The local test server runs in UTC+8; timestamps must represent UTC on any server.
  assert.ok(Math.abs(Date.now() - Date.parse(first.createdAt)) < 30000)
  const listed = (await app.inject('/api/workflows')).json().workflows
  assert.equal(listed[0].id, first.id)
  assert.equal(listed[0].prompt, undefined)
  assert.equal(listed[0].plan, undefined)
  await app.close()

  // A new application and connection pool must retrieve the saved workflow.
  const reopenedPool = createPool(config)
  t.after(() => reopenedPool.end())
  const reopened = buildApp({ repository: mysqlWorkflows(reopenedPool) })
  t.after(() => reopened.close())
  const retrieved = (await reopened.inject(`/api/workflows/${first.id}`)).json<{ workflow: SavedWorkflow }>().workflow
  assert.deepEqual(retrieved, first)
  const left = draftFixture(); left.plan.title = 'Left tab'
  const right = draftFixture(); right.plan.title = 'Right tab'
  const results = await Promise.all([left, right].map((draft) => reopened.inject({ method: 'PATCH', url: `/api/workflows/${first.id}`, payload: { expectedVersion: 1, draft } })))
  assert.deepEqual(results.map((result) => result.statusCode).sort(), [200, 409])
  const latest = (await reopened.inject(`/api/workflows/${first.id}`)).json<{ workflow: SavedWorkflow }>().workflow
  assert.equal(latest.version, 2)
  assert.ok(['Left tab', 'Right tab'].includes(latest.plan.title))
  const [history] = await reopenedPool.execute<RowDataPacket[]>('SELECT version, draft FROM workflow_versions WHERE workflow_id = ? ORDER BY version', [first.id])
  assert.equal(history.length, 2)
  assert.deepEqual(JSON.parse(history[0].draft), draft)
  const missing = await reopened.inject({ method: 'PATCH', url: `/api/workflows/${randomUUID()}`, payload: { expectedVersion: 1, draft } })
  assert.equal(missing.statusCode, 404)
  await reopenedPool.query("CREATE TRIGGER fail_test_version BEFORE INSERT ON workflow_versions FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Synthetic insert failure'")
  try {
    const failedUpdate = await reopened.inject({ method: 'PATCH', url: `/api/workflows/${first.id}`, payload: { expectedVersion: 2, draft } })
    assert.equal(failedUpdate.statusCode, 503)
    assert.ok(!failedUpdate.body.includes('Synthetic insert failure'))
    assert.deepEqual((await reopened.inject(`/api/workflows/${first.id}`)).json().workflow, latest)
    const failedCreate = await reopened.inject({ method: 'POST', url: '/api/workflows', payload: draft })
    assert.equal(failedCreate.statusCode, 503)
    assert.equal((await reopened.inject('/api/workflows')).json().workflows.length, 1)
  } finally { await reopenedPool.query('DROP TRIGGER fail_test_version') }
  const [checksums] = await reopenedPool.execute<RowDataPacket[]>('SELECT name, checksum FROM schema_migrations ORDER BY name LIMIT 1')
  await reopenedPool.execute('UPDATE schema_migrations SET checksum = ? WHERE name = ?', ['0'.repeat(64), checksums[0].name])
  try { await assert.rejects(migrate(reopenedPool), /applied migration was changed/) }
  finally { await reopenedPool.execute('UPDATE schema_migrations SET checksum = ? WHERE name = ?', [checksums[0].checksum, checksums[0].name]) }
  await migrate(reopenedPool)
  assert.equal((await reopened.inject('/api/health')).statusCode, 200)
})
