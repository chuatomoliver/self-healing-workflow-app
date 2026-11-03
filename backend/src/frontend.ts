import { accessSync, constants } from 'node:fs'
import { join } from 'node:path'
import fastifyStatic from '@fastify/static'
import type { FastifyInstance } from 'fastify'

export function serveFrontend(app: FastifyInstance, root: string) {
  accessSync(join(root, 'index.html'), constants.R_OK)
  app.register(fastifyStatic, { root, wildcard: false, dotfiles: 'deny', cacheControl: false })
  app.setNotFoundHandler((request, reply) => {
    let path: string
    try { path = decodeURIComponent(request.url.split('?')[0]) }
    catch { return reply.code(400).send({ error: { code: 'INVALID_PATH', message: 'Invalid request path.', requestId: request.id } }) }
    // Only browser page navigations get the SPA shell. API/asset failures stay 404.
    if (['GET', 'HEAD'].includes(request.method) && request.headers.accept?.includes('text/html')
      && path !== '/api' && !path.startsWith('/api/') && !path.split('/').some((part) => part.includes('.'))
      && !path.startsWith('/assets/')) {
      return reply.type('text/html').sendFile('index.html')
    }
    return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'This resource could not be found.', requestId: request.id } })
  })
}
