import { buildApp } from './app.ts'
import { readConfig } from './config.ts'
import { createPool, migrate } from './database.ts'
import { mysqlWorkflows } from './workflows/repository.ts'
import { mysqlDeliveries } from './webhooks/repository.ts'
import { createWebhookDeliveryService } from './webhooks/service.ts'
import { readDestinationPolicy } from './webhooks/destination.ts'
import { loadConnections } from './webhooks/connections.ts'
import { loadWebhookSecret } from './webhooks/credentials.ts'
import { mysqlRuns } from './execution/repository.ts'
import { createExecutionService } from './execution/service.ts'
import { createMuseCompiler, createMuseRepairer } from './muse/execution.ts'

let app: ReturnType<typeof buildApp> | undefined
let pool: ReturnType<typeof createPool> | undefined
try {
  const config = readConfig()
  pool = createPool(config)
  await migrate(pool)
  const repository = mysqlWorkflows(pool)
  const webhookDelivery = createWebhookDeliveryService({ workflows: repository, deliveries: mysqlDeliveries(pool), policy: readDestinationPolicy(), connections: loadConnections })
  const diagnostics = { onResponse: (details: import('./muse/client.ts').MuseResponseDetails) => { app?.log.info(details, 'Muse response') } }
  const execution = createExecutionService({ workflows: repository, runs: mysqlRuns(pool), delivery: webhookDelivery, compile: createMuseCompiler(diagnostics), repair: createMuseRepairer(diagnostics) })
  await execution.recover()
  app = buildApp({ repository, webhookDelivery, execution, connections: loadConnections, hasWebhookCredential: async (reference) => !!await loadWebhookSecret(reference), logger: config.logLevel !== 'silent', port: config.port })
  app.addHook('preClose', async () => { await execution.drain() })
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
