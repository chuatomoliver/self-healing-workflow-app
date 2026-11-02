import { readConfig } from './config.ts'
import { createPool, migrate } from './database.ts'

let pool: ReturnType<typeof createPool> | undefined
try {
  pool = createPool(readConfig())
  await migrate(pool)
  process.stdout.write('Database migrations applied.\n')
} catch {
  process.stderr.write('Migration failed. Check backend configuration and database availability.\n')
  process.exitCode = 1
} finally {
  await pool?.end()
}
