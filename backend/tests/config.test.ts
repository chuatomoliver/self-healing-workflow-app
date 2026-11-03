import assert from 'node:assert/strict'
import test from 'node:test'
import { readConfig } from '../src/config.ts'

const base = { DATABASE_URL: 'mysql://user:private-password@127.0.0.1/metaflow', NODE_ENV: 'development' }
test('validates backend settings and keeps connection strings out of validation errors', () => {
  assert.equal(readConfig(base).port, 3001)
  assert.equal(readConfig({ ...base, DATABASE_SSL: 'true' }).databaseSsl, true)
  for (const env of [
    {}, { ...base, PORT: '0' }, { ...base, PORT: 'abc' }, { ...base, DATABASE_SSL: 'yes' },
    { ...base, DATABASE_URL: 'https://private-password@example.test/database' },
    { ...base, DATABASE_URL: 'mysql://user:private-password@127.0.0.1/invalid/database' },
    { ...base, DATABASE_URL: `${base.DATABASE_URL}?sslmode=no-verify` }, { ...base, NODE_ENV: 'production' },
  ]) {
    assert.throws(() => readConfig(env), (error: unknown) => error instanceof Error && !error.message.includes('private-password'))
  }
})

test('development uses the local XAMPP default only when explicitly enabled', () => {
  const config = readConfig({}, { localDatabase: true })
  assert.equal(config.databaseUrl, 'mysql://root@127.0.0.1:3306/metaflow')
  assert.equal(config.localDatabase, true)
  assert.equal(config.databaseSsl, false)
  assert.equal(readConfig({ DATABASE_URL: '' }, { localDatabase: true }).localDatabase, true)
  assert.equal(readConfig({ NODE_ENV: 'development' }, { localDatabase: true }).port, 3001)
  assert.throws(() => readConfig({ NODE_ENV: 'production' }, { localDatabase: true }))
})

test('development preserves explicit database configuration without creating a database', () => {
  const config = readConfig({ ...base, DATABASE_SSL: 'true' }, { localDatabase: true })
  assert.equal(config.databaseUrl, base.DATABASE_URL)
  assert.equal(config.localDatabase, false)
  assert.equal(config.databaseSsl, true)
  assert.throws(() => readConfig({ DATABASE_URL: 'invalid' }, { localDatabase: true }))
})
