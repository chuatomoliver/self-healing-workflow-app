export type HostingConfig = { origin: string; username: string; password: string; open?: boolean }
export type Config = { port: number; host: string; hosting?: HostingConfig; databaseUrl: string; databaseSsl: boolean; localDatabase: boolean; logLevel: 'info' | 'silent' }

export function readConfig(env: NodeJS.ProcessEnv = process.env, options: { localDatabase?: boolean } = {}): Config {
  const port = Number(env.PORT ?? 3001)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.')
  if (env.NODE_ENV && !['development', 'test', 'production'].includes(env.NODE_ENV)) {
    throw new Error('NODE_ENV must be development, test, or production.')
  }
  let hosting: HostingConfig | undefined
  const production = env.NODE_ENV === 'production'
  if (production) {
    let origin: URL
    try {
      origin = new URL(env.APP_ORIGIN ?? '')
      if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error()
    } catch { throw new Error('Set APP_ORIGIN to the public HTTPS origin, without a path or credentials.') }
    if (env.DEMO_AUTH && !['enabled', 'disabled'].includes(env.DEMO_AUTH)) throw new Error('DEMO_AUTH must be enabled or disabled.')
    if (env.DEMO_AUTH === 'disabled') {
      // Explicit opt-out only; host checks and request limits still apply.
      hosting = { origin: origin.origin, username: '', password: '', open: true }
    } else {
      const username = env.DEMO_USERNAME ?? ''
      const password = env.DEMO_PASSWORD ?? ''
      if (!/^[A-Za-z0-9_.-]{1,80}$/.test(username) || password.length < 16 || password.length > 256 || /[\r\n\x00]/.test(password)) {
        throw new Error('Production requires DEMO_USERNAME and a DEMO_PASSWORD of 16–256 characters.')
      }
      hosting = { origin: origin.origin, username, password }
    }
  }
  const host = env.HOST || (production ? '0.0.0.0' : '127.0.0.1')
  if (!production && !['127.0.0.1', '::1', 'localhost'].includes(host)) throw new Error('Remote listening requires NODE_ENV=production and demo authentication.')
  if (!/^[a-zA-Z0-9.:-]+$/.test(host)) throw new Error('HOST must be a valid listening address.')
  const localDatabase = !production && options.localDatabase === true && !env.DATABASE_URL
  let databaseUrl: URL
  try {
    databaseUrl = new URL(localDatabase ? 'mysql://root@127.0.0.1:3306/metaflow' : env.DATABASE_URL ?? '')
    if (databaseUrl.protocol !== 'mysql:' || !databaseUrl.hostname || !/^\/[A-Za-z0-9_]+$/.test(databaseUrl.pathname)) throw new Error()
  } catch {
    throw new Error('Set DATABASE_URL to a MySQL database connection in the backend process environment.')
  }
  if (databaseUrl.search || databaseUrl.hash) throw new Error('Configure database TLS using DATABASE_SSL, without URL query parameters.')
  if (env.DATABASE_SSL && !['true', 'false'].includes(env.DATABASE_SSL)) throw new Error('DATABASE_SSL must be true or false.')
  return { port, host, ...(hosting ? { hosting } : {}), databaseUrl: databaseUrl.toString(), databaseSsl: env.DATABASE_SSL === 'true', localDatabase, logLevel: env.NODE_ENV === 'test' ? 'silent' : 'info' }
}
