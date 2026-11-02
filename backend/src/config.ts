export type Config = { port: number; databaseUrl: string; databaseSsl: boolean; logLevel: 'info' | 'silent' }

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 3001)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.')
  if (env.NODE_ENV && !['development', 'test'].includes(env.NODE_ENV)) {
    throw new Error('This foundation supports local development only. Authentication is required before deployment.')
  }
  let databaseUrl: URL
  try {
    databaseUrl = new URL(env.DATABASE_URL ?? '')
    if (databaseUrl.protocol !== 'mysql:' || !databaseUrl.hostname || !/^\/[A-Za-z0-9_]+$/.test(databaseUrl.pathname)) throw new Error()
  } catch {
    throw new Error('Set DATABASE_URL to a MySQL database connection in the backend process environment.')
  }
  if (databaseUrl.search || databaseUrl.hash) throw new Error('Configure database TLS using DATABASE_SSL, without URL query parameters.')
  if (env.DATABASE_SSL && !['true', 'false'].includes(env.DATABASE_SSL)) throw new Error('DATABASE_SSL must be true or false.')
  return { port, databaseUrl: databaseUrl.toString(), databaseSsl: env.DATABASE_SSL === 'true', logLevel: env.NODE_ENV === 'test' ? 'silent' : 'info' }
}
