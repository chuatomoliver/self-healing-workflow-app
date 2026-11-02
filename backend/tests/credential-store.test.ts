import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { createWindowsCredentialStore } from '../src/muse/credential-store.ts'

test('Windows Credential Manager preserves a test credential across processes and supports replacement/removal', {
  skip: process.platform !== 'win32' || process.env.RUN_WINDOWS_CREDENTIAL_TESTS !== '1',
}, async () => {
  // Use a separate random target so the real application key can never be overwritten.
  const target = `Metaflow/Test/${randomUUID()}`
  const first = createWindowsCredentialStore(target)
  try {
    assert.equal(await first.read(), undefined)
    await first.write('fake-credential-for-tests-only')
    const reopened = createWindowsCredentialStore(target)
    assert.equal(await reopened.read(), 'fake-credential-for-tests-only')
    await reopened.write('replacement-fake-credential')
    assert.equal(await first.read(), 'replacement-fake-credential')
    await first.remove()
    assert.equal(await reopened.read(), undefined)
    await reopened.remove()
  } finally { await first.remove() }
})
