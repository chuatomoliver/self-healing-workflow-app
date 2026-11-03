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

const deployed = { ...base, NODE_ENV: 'production', APP_ORIGIN: 'https://demo.example', DEMO_USERNAME: 'team', DEMO_PASSWORD: 'example-password-for-tests' }

test('production requires an HTTPS origin and demo login and never creates a local database', () => {
  const config = readConfig(deployed, { localDatabase: true })
  assert.equal(config.host, '0.0.0.0')
  assert.equal(config.localDatabase, false)
  assert.equal(config.hosting?.origin, 'https://demo.example')
  assert.equal(readConfig({ ...deployed, HOST: '127.0.0.1' }).host, '127.0.0.1')
  for (const overrides of [
    { APP_ORIGIN: '' }, { APP_ORIGIN: 'http://demo.example' }, { APP_ORIGIN: 'https://demo.example/path' },
    { APP_ORIGIN: 'https://team:private-password@demo.example' }, { DEMO_USERNAME: '' },
    { DEMO_PASSWORD: '' }, { DEMO_PASSWORD: 'short' }, { DATABASE_URL: '' }, { HOST: '0.0.0.0/path' },
  ]) assert.throws(() => readConfig({ ...deployed, ...overrides }, { localDatabase: true }),
    (error: unknown) => error instanceof Error && !error.message.includes('private-password'))
  assert.throws(() => readConfig({ ...base, HOST: '0.0.0.0' }))
  assert.equal(readConfig(base).host, '127.0.0.1')
})

test('the login can only be turned off explicitly, and still needs an HTTPS origin', () => {
  const open = { ...base, NODE_ENV: 'production', APP_ORIGIN: 'https://demo.example', DEMO_AUTH: 'disabled' }
  assert.equal(readConfig(open).hosting?.open, true)
  assert.equal(readConfig({ ...deployed, DEMO_AUTH: 'enabled' }).hosting?.open, undefined)
  assert.throws(() => readConfig({ ...open, DEMO_AUTH: 'off' }))
  assert.throws(() => readConfig({ ...open, APP_ORIGIN: 'http://demo.example' }))
  assert.throws(() => readConfig({ ...base, NODE_ENV: 'production', APP_ORIGIN: 'https://demo.example' }))
})
