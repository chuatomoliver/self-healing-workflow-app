import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import test from 'node:test'
import { cleanupMuseEnv, prepareMuseEnv } from '../../.github/actions/muse-env/env.mts'

function fixture(t: test.TestContext) {
  const directory = mkdtempSync(join(tmpdir(), 'metaflow-handoff-test-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const output = join(directory, 'github-output')
  writeFileSync(output, '')
  return { directory, output, env: { GITHUB_ACTIONS: 'true', RUNNER_TEMP: directory, GITHUB_OUTPUT: output } }
}

test('GitHub handoff preserves token punctuation through the real Node env loader and backend key reader', (t) => {
  const { env, directory, output } = fixture(t)
  for (const key of ['test-only-token', 'test-only-#$()=`"token', "test-only-'token", String.raw`test-only-\n\path\token`]) {
    const file = prepareMuseEnv({ ...env, MODEL_API_KEY: key })
    assert.equal(dirname(dirname(file)), directory)
    assert.equal(parseEnv(readFileSync(file, 'utf8')).MODEL_API_KEY, key)
    const childEnv: NodeJS.ProcessEnv = { ...process.env, EXPECTED_TEST_KEY: key }
    delete childEnv.MODEL_API_KEY
    const child = spawnSync(process.execPath, [`--env-file=${file}`, '--input-type=module', '-e', `
      import { loadMuseKey } from './src/muse/credential-store.ts';
      if (await loadMuseKey() !== process.env.EXPECTED_TEST_KEY) process.exit(1);
    `], { env: childEnv, cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8', windowsHide: true })
    assert.equal(child.status, 0)
    assert.equal(child.stdout, '')
    assert.ok(!child.stderr.includes(key))
    if (process.platform !== 'win32') {
      assert.equal(statSync(file).mode & 0o777, 0o600)
      assert.equal(statSync(dirname(file)).mode & 0o777, 0o700)
    }
    cleanupMuseEnv({ ...env, MUSE_ENV_FILE: file })
    assert.equal(existsSync(file), false)
    assert.equal(existsSync(dirname(file)), false)
    cleanupMuseEnv({ ...env, MUSE_ENV_FILE: file })
    const metadata = readFileSync(output, 'utf8')
    assert.ok(metadata.includes(`env-file=${file}`))
    assert.ok(!metadata.includes(key))
  }
})

test('missing secrets and env-line injection fail before publishing a handoff file or logging values', (t) => {
  const { env, output } = fixture(t)
  const command = fileURLToPath(new URL('../../.github/actions/muse-env/env.mts', import.meta.url))
  for (const key of ['', '   ', 'test-only-token\nNODE_OPTIONS=--inspect', 'test-only-token\rSECOND=value', 'test-only-\x01-token']) {
    assert.throws(() => prepareMuseEnv({ ...env, MODEL_API_KEY: key }))
    const child = spawnSync(process.execPath, [command, 'prepare'], { env: { ...process.env, ...env, MODEL_API_KEY: key }, encoding: 'utf8', windowsHide: true })
    assert.equal(child.status, 1)
    assert.equal(child.stdout, '')
    assert.match(child.stderr, /Muse handoff failed/)
    assert.ok(!child.stderr.includes('test-only-token'))
  }
  assert.equal(readFileSync(output, 'utf8'), '')
  assert.throws(() => prepareMuseEnv({ ...env, GITHUB_ACTIONS: 'false', MODEL_API_KEY: 'test-only-token' }))
})

test('cleanup refuses unrelated files and the handoff does not overwrite existing backend configuration', (t) => {
  const { env, directory } = fixture(t)
  const existing = join(directory, 'existing.env')
  writeFileSync(existing, 'DATABASE_URL=existing-private-setting\n')
  assert.throws(() => cleanupMuseEnv({ ...env, MUSE_ENV_FILE: existing }))
  const first = prepareMuseEnv({ ...env, MODEL_API_KEY: 'test-only-token' })
  const second = prepareMuseEnv({ ...env, MODEL_API_KEY: 'second-test-token' })
  assert.notEqual(first, second)
  assert.equal(readFileSync(existing, 'utf8'), 'DATABASE_URL=existing-private-setting\n')
  assert.throws(() => cleanupMuseEnv({ ...env, MUSE_ENV_FILE: join(dirname(first), 'other.env') }))
  cleanupMuseEnv({ ...env, MUSE_ENV_FILE: first })
  cleanupMuseEnv({ ...env, MUSE_ENV_FILE: second })
})
