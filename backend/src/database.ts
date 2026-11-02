import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import mysql from 'mysql2/promise'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import type { Config } from './config.ts'

export function createPool(config: Pick<Config, 'databaseUrl' | 'databaseSsl'>) {
  const url = new URL(config.databaseUrl)
  const pool = mysql.createPool({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    ssl: config.databaseSsl ? { rejectUnauthorized: true, verifyIdentity: true } : undefined,
    connectionLimit: 5,
    connectTimeout: 5000,
    idleTimeout: 30000,
    waitForConnections: true,
    queueLimit: 50,
    charset: 'utf8mb4',
    timezone: 'Z',
    jsonStrings: true,
    multipleStatements: false,
  })
  // Never print connection errors: they can include hostnames or credentials.
  pool.on('connection', (connection) => {
    connection.on('error', () => process.stderr.write('A database connection was interrupted.\n'))
  })
  return pool
}

export async function migrate(pool: Pool) {
  const client = await pool.getConnection()
  let lockName: string | undefined
  try {
    const [databases] = await client.query<(RowDataPacket & { name: string })[]>('SELECT DATABASE() AS name')
    const name = `metaflow:migrations:${createHash('sha256').update(databases[0].name).digest('hex').slice(0, 40)}`
    const [locks] = await client.execute<(RowDataPacket & { acquired: number | null })[]>('SELECT GET_LOCK(?, 10) AS acquired', [name])
    if (locks[0].acquired !== 1) throw new Error('Could not acquire the migration lock.')
    lockName = name
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name varchar(255) CHARACTER SET ascii PRIMARY KEY,
      checksum char(64) CHARACTER SET ascii NOT NULL,
      applied_at datetime(6) NOT NULL
    ) ENGINE=InnoDB`)
    const [appliedRows] = await client.query<(RowDataPacket & { name: string; checksum: string })[]>('SELECT name, checksum FROM schema_migrations')
    const applied = new Map(appliedRows.map((row) => [row.name, row.checksum]))
    const directory = new URL('../migrations/', import.meta.url)
    const files = (await readdir(directory)).filter((file) => /^\d+_[\w-]+\.sql$/.test(file)).sort()
    for (const name of files) {
      const sql = await readFile(new URL(name, directory), 'utf8')
      const checksum = createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex')
      if (applied.has(name)) {
        if (applied.get(name) !== checksum) throw new Error('An applied migration was changed. Add a new migration instead.')
        continue
      }
      // MySQL DDL commits implicitly. Each file is one retry-safe statement;
      // record it only after successful execution. Keep the session lock throughout.
      await client.query(sql)
      await client.execute('INSERT INTO schema_migrations (name, checksum, applied_at) VALUES (?, ?, UTC_TIMESTAMP(6))', [name, checksum])
    }
  } finally {
    try { if (lockName) await client.execute('SELECT RELEASE_LOCK(?)', [lockName]) }
    finally { client.release() }
  }
}
