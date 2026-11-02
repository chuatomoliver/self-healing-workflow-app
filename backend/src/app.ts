import Fastify, { LogController } from 'fastify'
import type { FastifyError } from 'fastify'
import type { UpdateWorkflowRequest, WorkflowDraft } from '../../shared/workflows.ts'
import { ApiError } from './errors.ts'
import type { WorkflowRepository } from './workflows/repository.ts'
import { draftSchema, listQuerySchema, updateSchema, workflowParamsSchema } from './workflows/schema.ts'
import { validateDraft } from './workflows/validation.ts'

type AppOptions = { repository: WorkflowRepository; logger?: boolean; port?: number }
export function buildApp({ repository, logger = false, port = 3001 }: AppOptions) {
  const app = Fastify({
    logger: logger ? { level: 'info', redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'] } : false,
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 512 * 1024,
    requestTimeout: 15000,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false, useDefaults: false, allErrors: false } },
  })
  const allowedOrigins = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`, 'http://localhost:5173', 'http://127.0.0.1:5173'])
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff')
    if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(request.headers.host ?? '')) {
      throw new ApiError(403, 'LOCAL_ACCESS_ONLY', 'This development API accepts localhost requests only.')
    }
    if ((request.headers.origin && !allowedOrigins.has(request.headers.origin)) || request.headers['sec-fetch-site'] === 'cross-site') {
      throw new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'This request origin is not allowed.')
    }
  })
  app.addHook('onResponse', async (request, reply) => {
    app.log.info({ requestId: request.id, method: request.method, route: request.routeOptions.url ?? 'unmatched', statusCode: reply.statusCode }, 'Request completed')
  })
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    let status = 503
    let code = 'SERVICE_UNAVAILABLE'
    let message = 'The service is temporarily unavailable. Please try again.'
    if (error instanceof ApiError) {
      status = error.statusCode; code = error.code; message = error.message
    } else if (error.validation) {
      status = 400; code = 'INVALID_REQUEST'; message = 'The request does not match the workflow contract. Check required fields, types, and limits.'
    } else if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      status = error.statusCode
      code = status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_REQUEST'
      message = status === 413 ? 'Keep workflow requests within 512 KB.' : 'The request could not be processed.'
    }
    if (status >= 500) app.log.error({ requestId: request.id, code }, 'Request failed')
    reply.code(status).send({ error: { code, message, requestId: request.id } })
  })
  app.setNotFoundHandler((request, reply) => reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'This API endpoint could not be found.', requestId: request.id } }))
  app.get('/api/health', async () => { await repository.health(); return { status: 'ok' } })
  app.get('/api/workflows', { schema: { querystring: listQuerySchema } }, async () => ({ workflows: await repository.list() }))
  app.post<{ Body: WorkflowDraft }>('/api/workflows', { schema: { body: draftSchema } }, async (request, reply) => {
    validateDraft(request.body)
    const workflow = await repository.create(request.body)
    return reply.code(201).header('Location', `/api/workflows/${workflow.id}`).send({ workflow })
  })
  app.get<{ Params: { id: string } }>('/api/workflows/:id', { schema: { params: workflowParamsSchema } }, async (request) => ({ workflow: await repository.get(request.params.id) }))
  app.patch<{ Params: { id: string }; Body: UpdateWorkflowRequest }>('/api/workflows/:id', { schema: { params: workflowParamsSchema, body: updateSchema } }, async (request) => {
    validateDraft(request.body.draft)
    return { workflow: await repository.update(request.params.id, request.body.expectedVersion, request.body.draft) }
  })
  return app
}
