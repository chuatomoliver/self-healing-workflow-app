import { pathToFileURL } from 'node:url'
import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import { createWindowsCredentialStore, loadMuseKey } from '../src/muse/credential-store.ts'
import type { MuseCredentialStore } from '../src/muse/credential-store.ts'

const endpoint = 'https://api.meta.ai/v1/responses'
const successText = 'Muse connection successful'

async function readPrivateKey(): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Run npm.cmd run muse:setup in an interactive terminal to enter your key privately.')
  }
  // Readline handles editing and paste, while its output sink discards all input echo.
  const hiddenOutput = new Writable({ write(_chunk, _encoding, done) { done() } })
  const terminal = createInterface({ input: process.stdin, output: hiddenOutput, terminal: true, historySize: 0 })
  const cancelled = new AbortController()
  terminal.once('SIGINT', () => cancelled.abort())
  terminal.once('close', () => cancelled.abort())
  process.stdout.write('Muse connection test: one API request. API usage charges may apply.\nPaste your Meta Muse API key (hidden), then press Enter: ')
  try {
    return await terminal.question('', { signal: cancelled.signal })
  } catch {
    throw new Error('Muse connection test cancelled.')
  } finally {
    terminal.close()
    process.stdin.unref()
    hiddenOutput.destroy()
    process.stdout.write('\n')
  }
}

export async function testMuseConnection(env: NodeJS.ProcessEnv = process.env, send: typeof fetch = fetch): Promise<void> {
  const key = env.MODEL_API_KEY?.trim()
  if (!key) throw new Error('No Muse key supplied. Run npm.cmd run muse:setup once to save it privately.')

  let response: Response
  let payload: unknown
  try {
    // No retries: this command makes one billable request, using only a fixed test prompt.
    response = await send(endpoint, {
      method: 'POST',
      redirect: 'error',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'muse-spark-1.3',
        input: `Reply with exactly: ${successText}`,
        max_output_tokens: 1024,
        store: false,
      }),
      signal: AbortSignal.timeout(60000),
    })
  } catch {
    throw new Error('Cannot reach Muse. Check your internet connection and try again; the request may have reached the provider.')
  }

  if (!response.ok) {
    // Never print provider bodies or raw exceptions, which could contain credentials.
    const messages: Record<number, string> = {
      400: 'Muse rejected the test request. Check the current Meta API contract.',
      401: 'Muse rejected the API key. Check or replace it in the Meta dashboard.',
      402: 'Muse requires billing setup. Check billing in the Meta dashboard.',
      403: 'This key does not have access. Check project permissions and model access.',
      404: 'Muse Spark 1.3 is unavailable for this key. Check model access in the Meta dashboard.',
      429: 'Muse rate or usage limit reached. Check your quota before retrying.',
    }
    throw new Error(messages[response.status] ?? `Muse returned HTTP ${response.status}. Try again later.`)
  }
  try { payload = await response.json() }
  catch { throw new Error('Muse returned an unreadable response. The connection test did not complete.') }

  const data = payload as { status?: unknown; output?: unknown } | null
  const matched = data?.status === 'completed' && Array.isArray(data.output) && data.output.some((item: unknown) => {
    if (!item || typeof item !== 'object' || !('type' in item) || item.type !== 'message' || !('content' in item) || !Array.isArray(item.content)) return false
    return item.content.some((part: unknown) => !!part && typeof part === 'object' && 'type' in part && part.type === 'output_text' && 'text' in part && typeof part.text === 'string' && part.text.includes(successText))
  })
  if (!matched) throw new Error('Muse responded, but did not complete the expected test reply. Check model availability or try again.')
}

type CommandOptions = {
  env?: NodeJS.ProcessEnv
  store?: MuseCredentialStore
  prompt?: () => Promise<string>
  send?: typeof fetch
}

export async function runMuseCommand(args: string[], options: CommandOptions = {}): Promise<string> {
  if (args.length > 1 || (args.length === 1 && !['--prompt', '--save', '--forget'].includes(args[0]))) {
    throw new Error('Use muse:setup, muse:test, muse:test:prompt, or muse:forget without additional arguments.')
  }
  const store = options.store ?? createWindowsCredentialStore()
  if (args[0] === '--forget') {
    await store.remove()
    return 'Saved Muse key removed. Any MODEL_API_KEY supplied by your environment is unchanged.'
  }
  if (args[0] === '--save' && process.platform !== 'win32') {
    throw new Error('Saved Muse keys currently require Windows. Use MODEL_API_KEY on other systems.')
  }
  const key = args[0] === '--prompt' || args[0] === '--save'
    ? (await (options.prompt ?? readPrivateKey)()).trim()
    : await loadMuseKey(options.env ?? process.env, store)
  await testMuseConnection({ MODEL_API_KEY: key }, options.send)
  if (args[0] === '--save') {
    // A failed test leaves the previous saved credential intact.
    await store.write(key!)
    return `${successText}. Key saved in Windows Credential Manager for this Windows account. Future tests can use npm.cmd run muse:test, including after a restart.`
  }
  return `${successText}. Model: muse-spark-1.3.`
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(await runMuseCommand(process.argv.slice(2)))
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Muse connection test failed.')
    process.exitCode = 1
  }
}
