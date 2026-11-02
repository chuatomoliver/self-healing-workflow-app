import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'

export type MuseCredentialStore = {
  read(): Promise<string | undefined>
  write(key: string): Promise<void>
  remove(): Promise<void>
}

export function createWindowsCredentialStore(target = 'Metaflow/MuseApiKey'): MuseCredentialStore {
  async function invoke(operation: 'read' | 'write' | 'remove', key?: string): Promise<string | undefined> {
    if (process.platform !== 'win32') {
      if (operation === 'read') return undefined
      throw new Error('Saved Muse keys currently require Windows. Use MODEL_API_KEY on other systems.')
    }
    let source: string
    try { source = await readFile(new URL('./windows-credential-store.cs', import.meta.url), 'utf8') }
    catch { throw new Error('The Windows credential helper is missing. Restore the backend source files.') }
    // Static helper code goes in the command; the secret travels only over the child's stdin.
    // -Command runs inline code without loading .ps1 files or changing execution policy.
    const command = `$ErrorActionPreference = 'Stop'
try {
Add-Type -TypeDefinition @'
${source}
'@
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
$key = $null
switch ($request.operation) {
  'read' { $key = [MetaflowCredentialStore]::Read($request.target) }
  'write' { [MetaflowCredentialStore]::Write($request.target, $request.key) }
  'remove' { [MetaflowCredentialStore]::Remove($request.target) }
  default { exit 1 }
}
[Console]::Out.Write((@{ key = $key } | ConvertTo-Json -Compress))
} catch { exit 1 }`
    return new Promise((accept, reject) => {
      const child = execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], {
        windowsHide: true, timeout: 20000, maxBuffer: 16384, encoding: 'utf8',
      }, (error, stdout) => {
        if (error) { reject(new Error('Cannot access Windows Credential Manager. Check your Windows account permissions.')); return }
        try {
          const result: unknown = JSON.parse(stdout)
          if (!result || typeof result !== 'object' || !('key' in result) || (result.key !== null && typeof result.key !== 'string')) throw new Error()
          accept(typeof result.key === 'string' ? result.key : undefined)
        } catch { reject(new Error('Windows Credential Manager returned an unreadable result.')) }
      })
      // Native-process exceptions and output are never forwarded to application logs.
      child.stdin?.on('error', () => { /* The callback reports a failed child safely. */ })
      child.stdin?.end(JSON.stringify({ operation, target, key }))
    })
  }
  return {
    read: () => invoke('read'),
    write: async (key) => { await invoke('write', key) },
    remove: async () => { await invoke('remove') },
  }
}

export async function loadMuseKey(env: NodeJS.ProcessEnv = process.env, store = createWindowsCredentialStore()): Promise<string | undefined> {
  return env.MODEL_API_KEY?.trim() || (await store.read())?.trim() || undefined
}
