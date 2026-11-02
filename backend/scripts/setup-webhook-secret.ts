import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import { createWindowsCredentialStore } from '../src/muse/credential-store.ts'
import { validCredentialReference } from '../src/webhooks/credentials.ts'

try {
  const reference = process.argv[2] ?? ''
  if (!validCredentialReference(reference) || process.argv.length !== 3) throw new Error('Usage: npm.cmd run webhook:secret -- your_reference_name')
  if (process.platform !== 'win32' || !process.stdin.isTTY) throw new Error('Use an interactive Windows terminal, or inject WEBHOOK_SECRET_<reference> through your secret manager.')
  const output = new Writable({ write(_chunk, _encoding, done) { done() } })
  const terminal = createInterface({ input: process.stdin, output, terminal: true, historySize: 0 })
  const cancelled = new AbortController()
  terminal.once('SIGINT', () => cancelled.abort())
  process.stdout.write('Paste the webhook secret (hidden), then press Enter: ')
  let secret: string
  try { secret = (await terminal.question('', { signal: cancelled.signal })).trim() }
  finally { terminal.close(); process.stdin.unref(); output.destroy(); process.stdout.write('\n') }
  if (!secret || secret.length > 4096) throw new Error('Enter a nonempty secret up to 4096 characters.')
  await createWindowsCredentialStore(`Metaflow/Webhook/${reference}`).write(secret)
  console.log('Webhook credential saved for this Windows account. No webhook or AI request was sent.')
} catch {
  console.error('Webhook credential setup did not complete. Use npm.cmd run webhook:secret -- reference_name in an interactive Windows terminal.')
  process.exitCode = 1
}
