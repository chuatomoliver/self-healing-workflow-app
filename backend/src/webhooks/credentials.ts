import { createWindowsCredentialStore } from '../muse/credential-store.ts'
import type { MuseCredentialStore } from '../muse/credential-store.ts'
import { createHash } from 'node:crypto'
import { lstat, mkdir, open, realpath, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export function validCredentialReference(reference: string) { return /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(reference) }
const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url))
export function createWebhookCredentialStore(reference: string, env: NodeJS.ProcessEnv = process.env, platform = process.platform): MuseCredentialStore {
  if (!validCredentialReference(reference)) throw new Error('Invalid webhook credential reference.')
  if (platform === 'win32') return createWindowsCredentialStore(`Metaflow/Webhook/${reference}`)
  const directory = resolve(env.WEBHOOK_SECRETS_DIR || join(homedir(), '.config', 'Metaflow', 'webhook-secrets'))
  const outsideRepository = (path: string) => {
    const pathFromRepo = relative(resolve(repositoryRoot), path)
    if (!isAbsolute(pathFromRepo) && pathFromRepo !== '..' && !pathFromRepo.startsWith(`..${sep}`))
      throw new Error('Webhook secrets must be outside the application directory.')
  }
  outsideRepository(directory)
  const file = join(directory, createHash('sha256').update(reference).digest('hex'))
  const inspectDirectory = async () => {
    const info = await lstat(directory)
    if (!info.isDirectory() || info.isSymbolicLink() || (process.platform !== 'win32' && (info.mode & 0o077))) throw new Error('Webhook secret storage requires a private directory.')
    outsideRepository(await realpath(directory))
  }
  return {
    async read() {
      try {
        await inspectDirectory()
        const info = await lstat(file)
        if (!info.isFile() || info.isSymbolicLink() || info.size > 16384 || (process.platform !== 'win32' && (info.mode & 0o077))) throw new Error('Invalid webhook secret file.')
        const handle = await open(file, 'r')
        try { return await handle.readFile('utf8') } finally { await handle.close() }
      } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
    },
    async write(value) {
      if (!value || Buffer.byteLength(value) > 16384) throw new Error('Invalid webhook secret size.')
      await mkdir(directory, { recursive: true, mode: 0o700 })
      await inspectDirectory()
      const handle = await open(file, 'wx', 0o600)
      try { await handle.writeFile(value, 'utf8') } finally { await handle.close() }
    },
    async remove() { await inspectDirectory(); await rm(file, { force: true }) },
  }
}
export async function loadWebhookSecret(reference: string, env: NodeJS.ProcessEnv = process.env) {
  if (!validCredentialReference(reference)) return undefined
  return env[`WEBHOOK_SECRET_${reference}`] || await createWebhookCredentialStore(reference, env).read()
}
