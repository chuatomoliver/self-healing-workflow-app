import { createHash, timingSafeEqual } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import type { HostingConfig } from './config.ts'
import { ApiError } from './errors.ts'

// A shared, password-protected demo workspace. Credentials never enter the bundle.
export function protectHostedApp(app: FastifyInstance, hosting: HostingConfig) {
  const host = new URL(hosting.origin).host
  const digest = (value: string) => createHash('sha256').update(value).digest()
  const expected = digest(`Basic ${Buffer.from(`${hosting.username}:${hosting.password}`).toString('base64')}`)
  type Limiter = ReturnType<FastifyInstance['createRateLimit']>
  let loginLimit: Limiter
  let apiLimit: Limiter
  let writeLimit: Limiter
  app.register(rateLimit, { global: false })
  app.addHook('onReady', async () => {
    loginLimit = app.createRateLimit({ max: 20, timeWindow: '1 minute' })
    // One demo workspace and budget per server process, independent of proxy headers.
    apiLimit = app.createRateLimit({ max: 600, timeWindow: '1 minute', keyGenerator: () => 'workspace' })
    writeLimit = app.createRateLimit({ max: 30, timeWindow: '1 minute', keyGenerator: () => 'workspace-writes' })
  })
  const enforce = async (limit: Limiter, request: FastifyRequest, reply: FastifyReply) => {
    const result = await limit(request)
    if (!result.isAllowed && result.isExceeded) {
      reply.header('Retry-After', String(Math.max(1, result.ttlInSeconds)))
      throw new ApiError(429, 'RATE_LIMITED', 'Too many requests. Wait a minute and try again.')
    }
  }
  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Frame-Options', 'DENY').header('Referrer-Policy', 'same-origin')
      .header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'")
    // Host is checked directly; forwarded headers are not trusted for authentication.
    if (request.headers.host !== host && !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(request.headers.host ?? '')) {
      throw new ApiError(403, 'HOST_NOT_ALLOWED', 'This request host is not allowed.')
    }
    let pathname: string
    try { pathname = decodeURIComponent(request.url.split('?')[0]) }
    catch { throw new ApiError(400, 'INVALID_PATH', 'Invalid request path.') }
    const isApi = pathname === '/api' || pathname.startsWith('/api/')
    // Opening the page from another site (a shared link) is allowed; it still needs the login
    // and cannot be framed or read by that site. Everything else cross-site stays blocked.
    const linkedNavigation = !isApi && (request.method === 'GET' || request.method === 'HEAD')
      && request.headers['sec-fetch-mode'] === 'navigate' && request.headers['sec-fetch-dest'] === 'document'
    if ((request.headers.origin && request.headers.origin !== hosting.origin) || (request.headers['sec-fetch-site'] === 'cross-site' && !linkedNavigation)) {
      throw new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'This request origin is not allowed.')
    }
    // Health exposes no configuration or user data and supports hosting probes.
    if ((request.method === 'GET' || request.method === 'HEAD') && pathname === '/api/health') return
    if (!timingSafeEqual(digest(request.headers.authorization ?? ''), expected)) {
      await enforce(loginLimit, request, reply)
      reply.header('WWW-Authenticate', 'Basic realm="Metaflow demo", charset="UTF-8"')
      throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Sign in to access this demo workspace.')
    }
    if (isApi) {
      await enforce(apiLimit, request, reply)
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) await enforce(writeLimit, request, reply)
    }
  })
}
