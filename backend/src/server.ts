import { buildApp } from './app.ts'
import { readConfig } from './config.ts'
import { createPool, migrate } from './database.ts'
import { mysqlWorkflows } from './workflows/repository.ts'

let app: ReturnType<typeof buildApp> | undefined
let pool: ReturnType<typeof createPool> | undefined
try {
  const config = readConfig()
  pool = createPool(config)
  await migrate(pool)
  app = buildApp({ repository: mysqlWorkflows(pool), logger: config.logLevel !== 'silent', port: config.port })
  app.addHook('onClose', async () => { await pool?.end() })
  await app.listen({ port: config.port, host: '127.0.0.1' })
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app?.close() })
} catch (error) {
  // Configuration errors contain field names only. Never print raw database errors.
  process.stderr.write(pool ? 'Backend startup failed. Check database availability and port configuration.\n' : `${error instanceof Error ? error.message : 'Invalid backend configuration.'}\n`)
  await app?.close()
  if (!app) await pool?.end()
  process.exitCode = 1
}
