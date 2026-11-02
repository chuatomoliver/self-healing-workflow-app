import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { connectionFile, parseConnections } from '../src/webhooks/connections.ts'

const id = process.argv[2]
if (!id || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(id)) {
  process.stderr.write('Usage: npm.cmd run webhook:connection -- connection_id\n')
  process.exitCode = 1
} else {
  const terminal = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const file = connectionFile()
    let existing: ReturnType<typeof parseConnections> = []
    try { existing = parseConnections(JSON.parse(await readFile(file, 'utf8'))) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    const name = (await terminal.question('Connection name (e.g. Sales notifications): ')).trim()
    const description = (await terminal.question('What should Muse use this connection for? ')).trim()
    const endpointUrl = (await terminal.question('Receiver HTTPS address: ')).trim()
    const type = (await terminal.question('Authentication type (secret-header or signature): ')).trim()
    const headerName = (await terminal.question('Authentication header name: ')).trim()
    const secretRef = (await terminal.question('Saved credential reference (never the secret): ')).trim()
    const next = parseConnections([...existing.filter((item) => item.id !== id), { id, name, description, endpointUrl, authentication: { type, headerName, secretRef } }])
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 })
    process.stdout.write(`Connection saved. Store its credential once with npm.cmd run webhook:secret -- ${secretRef}.\nAllow its destination origin in WEBHOOK_ALLOWED_ORIGINS before delivery. No request was sent.\n`)
  } catch { process.stderr.write('Connection was not saved. Check the existing file and entered values; do not enter secret values here.\n'); process.exitCode = 1 }
  finally { terminal.close() }
}
