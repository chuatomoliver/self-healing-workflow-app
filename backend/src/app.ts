import Fastify, { LogController } from 'fastify'
import type { FastifyError } from 'fastify'
import type { UpdateWorkflowRequest, WorkflowDraft } from '../../shared/workflows.ts'
import { ApiError } from './errors.ts'
import type { WorkflowRepository } from './workflows/repository.ts'
import { draftSchema, listQuerySchema, updateSchema, workflowParamsSchema } from './workflows/schema.ts'
import { validateDraft } from './workflows/validation.ts'
import { MAX_PARSE_BODY_BYTES, MUSE_PARSE_MODEL } from '../../shared/parsing.ts'
import type { ParseWorkflowRequest, WorkflowExtraction } from '../../shared/parsing.ts'
import { createMuseParser, validateParseInput } from './muse/parser.ts'
import type { MuseParser } from './muse/parser.ts'
import type { MuseResponseDetails } from './muse/client.ts'
import { extractionSchema, parseRequestSchema } from './muse/parsing-schema.ts'
import { draftFromExtraction } from './muse/draft.ts'
import { createMusePlanner, planFromProposal, planningSchema } from './muse/planning.ts'
import type { MusePlanner } from './muse/planning.ts'
import type { PlanWorkflowRequest, PlanningProposal } from '../../shared/planning.ts'
import { refreshPlanChecks } from '../../shared/setup.ts'
import type { DeliveryRequest } from '../../shared/deliveries.ts'
import type { WebhookDeliveryService } from './webhooks/service.ts'
import type { WebhookConnection } from '../../shared/connections.ts'
import { connectionSummaries } from '../../shared/connections.ts'
import { validateConnectionBindings } from './webhooks/connections.ts'
import { createMusePreparer, preparationSchema, draftFromPreparation, bindPlanConnections } from './muse/preparation.ts'
import type { MusePreparer, WorkflowPreparation } from './muse/preparation.ts'
import type { ExecutionService } from './execution/service.ts'
import { executionRoutes } from './execution/routes.ts'
import type { SlackSetupRequest, SlackSetupResult } from '../../shared/slack.ts'

type AppOptions = { repository: WorkflowRepository; logger?: boolean; port?: number; parse?: MuseParser; plan?: MusePlanner; prepare?: MusePreparer; connections?: () => Promise<WebhookConnection[]>; hasWebhookCredential?: (reference: string) => Promise<boolean>; webhookDelivery?: WebhookDeliveryService; execution?: ExecutionService; setupSlack?: (input: SlackSetupRequest) => Promise<SlackSetupResult> }
export function buildApp({ repository, logger = false, port = 3001, parse, plan, prepare, connections = async () => [], hasWebhookCredential = async () => false, webhookDelivery, execution, setupSlack }: AppOptions) {
  const app = Fastify({
    logger: logger ? { level: 'info', redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'] } : false,
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 512 * 1024,
    requestTimeout: 15000,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false, useDefaults: false, allErrors: false } },
  })
  const reportMuse = (details: MuseResponseDetails) => {
    app.log.info(details, 'Muse response')
  }
  const parseWorkflow = parse ?? createMuseParser({ onResponse: reportMuse })
  const planWorkflow = plan ?? createMusePlanner({ onResponse: reportMuse })
  const prepareWorkflow = prepare ?? createMusePreparer({ onResponse: reportMuse })
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
      message = status === 413 ? 'This request is too large. Diagrams must be within 10 MB and saved drafts within 512 KB.' : 'The request could not be processed.'
    }
    if (status >= 500) app.log.error({ requestId: request.id, code }, 'Request failed')
    reply.code(status).send({ error: { code, message, requestId: request.id } })
  })
  app.setNotFoundHandler((request, reply) => reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'This API endpoint could not be found.', requestId: request.id } }))
  app.get('/api/health', async () => { await repository.health(); return { status: 'ok' } })
  let parsing = false
  app.get('/api/connections', async () => ({ connections: connectionSummaries(await connections()) }))
  app.get('/api/connections/slack', async () => ({ connections: (await connections())
    .filter((connection) => connection.authentication.type === 'slack-webhook')
    .map((connection) => ({ connection, channel: connection.slackChannel ?? '' })) }))
  app.post<{ Body: SlackSetupRequest }>('/api/connections/slack', {
    bodyLimit: 8192, schema: { body: { type: 'object', additionalProperties: false, required: ['name', 'channel', 'webhookUrl'], properties: {
      name: { type: 'string', minLength: 1, maxLength: 200 }, channel: { type: 'string', minLength: 2, maxLength: 81 }, webhookUrl: { type: 'string', minLength: 1, maxLength: 2048 },
    } } },
  }, async (request, reply) => {
    if (!setupSlack) throw new ApiError(503, 'SLACK_SETUP_UNAVAILABLE', 'Slack connection setup is unavailable on this backend.')
    return reply.code(201).send(await setupSlack(request.body))
  })
  app.post<{ Body: ParseWorkflowRequest }>('/api/prepare', {
    bodyLimit: MAX_PARSE_BODY_BYTES, schema: { body: parseRequestSchema },
  }, async (request, reply) => {
    validateParseInput(request.body)
    if (parsing) throw new ApiError(429, 'PARSE_BUSY', 'Another AI request is in progress. Wait for it to finish.')
    parsing = true
    const controller = new AbortController()
    const disconnect = () => { if (!reply.raw.writableFinished) controller.abort() }
    reply.raw.once('close', disconnect)
    try {
      const catalog = await connections()
      const output = await prepareWorkflow(request.body, controller.signal, connectionSummaries(catalog))
      const validate = request.compileValidationSchema(preparationSchema)
      if (!validate(output)) {
        const issues = validate.errors as { instancePath?: string; keyword?: string }[] | null | undefined
        if (issues?.some((issue) => /^\/extraction\/webhooks\/\d+\/event$/.test(issue.instancePath ?? '') && issue.keyword === 'pattern'))
          throw new ApiError(502, 'MUSE_INVALID_WEBHOOK_EVENT', 'Muse returned a webhook event with unsupported characters. Event identifiers must use a format such as order.created. No draft was replaced and no automatic retry was made.')
        throw new ApiError(502, 'MUSE_INVALID_RESPONSE', 'Muse returned an invalid workflow setup. Your current draft has not been replaced.')
      }
      const draft = await draftFromPreparation(output as WorkflowPreparation, request.body.prompt, catalog, hasWebhookCredential)
      try {
        if (!request.compileValidationSchema(draftSchema)(draft)) throw new Error('Invalid draft')
        validateDraft(draft, webhookDelivery?.localReceiverUrl)
        validateConnectionBindings(draft.plan, catalog)
      } catch { throw new ApiError(502, 'MUSE_INVALID_RESPONSE', 'Muse returned inconsistent workflow setup. Your current draft has not been replaced.') }
      return { draft, model: MUSE_PARSE_MODEL }
    } finally { parsing = false; reply.raw.removeListener('close', disconnect) }
  })
  app.post<{ Body: PlanWorkflowRequest }>('/api/plan', { schema: { body: draftSchema } }, async (request, reply) => {
    validateDraft(request.body, webhookDelivery?.localReceiverUrl)
    if (parsing) throw new ApiError(429, 'PARSE_BUSY', 'Another AI request is in progress. Wait for it to finish.')
    parsing = true
    const controller = new AbortController()
    const disconnect = () => { if (!reply.raw.writableFinished) controller.abort() }
    reply.raw.once('close', disconnect)
    try {
      const catalog = await connections()
      const raw = await planWorkflow(request.body, controller.signal, connectionSummaries(catalog))
      const proposal = raw && typeof raw === 'object' && !Array.isArray(raw) ? { webhookBindings: [], ...raw } : raw
      if (!request.compileValidationSchema(planningSchema)(proposal)) throw new ApiError(502, 'MUSE_INVALID_RESPONSE', 'Muse returned an invalid plan. Your current draft has not been replaced.')
      const proposed = proposal as PlanningProposal
      const merged = planFromProposal(request.body, proposed)
      const nextPlan = request.body.plan.configurationMode === 'automatic' || proposed.webhookBindings?.length
        ? await bindPlanConnections(merged, proposed.webhookBindings, catalog, hasWebhookCredential) : merged
      const draft = { ...request.body, plan: nextPlan }
      try {
        if (!request.compileValidationSchema(draftSchema)(draft)) throw new Error('Invalid plan')
        validateDraft(draft, webhookDelivery?.localReceiverUrl)
        validateConnectionBindings(draft.plan, catalog)
      } catch { throw new ApiError(502, 'MUSE_INVALID_RESPONSE', 'Muse returned an inconsistent plan. Your current draft has not been replaced.') }
      return { plan: nextPlan, model: MUSE_PARSE_MODEL }
    } finally { parsing = false; reply.raw.removeListener('close', disconnect) }
  })
  app.post<{ Body: ParseWorkflowRequest }>('/api/parse', {
    bodyLimit: MAX_PARSE_BODY_BYTES, schema: { body: parseRequestSchema },
  }, async (request, reply) => {
    validateParseInput(request.body)
    if (parsing) throw new ApiError(429, 'PARSE_BUSY', 'A workflow is already being parsed. Wait for it to finish before trying again.')
    parsing = true
    const controller = new AbortController()
    const disconnect = () => { if (!reply.raw.writableFinished) controller.abort() }
    reply.raw.once('close', disconnect)
    try {
      const extracted = await parseWorkflow(request.body, controller.signal)
      if (!request.compileValidationSchema(extractionSchema)(extracted)) {
        throw new ApiError(502, 'MUSE_INVALID_RESPONSE', 'Muse returned an invalid workflow structure. Review your input and try again.')
      }
      const extraction = extracted as WorkflowExtraction
      if (!extraction.nodes.length) throw new ApiError(422, 'NO_WORKFLOW_FOUND', 'No workflow could be identified. Describe the trigger, actions, and connections or use a clearer diagram.')
      const draft = draftFromExtraction(extraction, request.body.prompt)
      try {
        if (!request.compileValidationSchema(draftSchema)(draft)) throw new Error('Invalid draft')
        validateDraft(draft, webhookDelivery?.localReceiverUrl)
      } catch {
        throw new ApiError(502, 'MUSE_INVALID_RESPONSE', 'Muse returned inconsistent steps or connections. Clarify the workflow and try again.')
      }
      return { draft, model: MUSE_PARSE_MODEL }
    } finally {
      parsing = false
      reply.raw.removeListener('close', disconnect)
    }
  })
  app.get('/api/workflows', { schema: { querystring: listQuerySchema } }, async () => ({ workflows: await repository.list() }))
  app.post<{ Body: WorkflowDraft }>('/api/workflows', { schema: { body: draftSchema } }, async (request, reply) => {
    validateDraft(request.body, webhookDelivery?.localReceiverUrl)
    validateConnectionBindings(request.body.plan, await connections())
    const workflow = await repository.create({ ...request.body, plan: refreshPlanChecks(request.body.plan) })
    return reply.code(201).header('Location', `/api/workflows/${workflow.id}`).send({ workflow })
  })
  app.get<{ Params: { id: string } }>('/api/workflows/:id', { schema: { params: workflowParamsSchema } }, async (request) => ({ workflow: await repository.get(request.params.id) }))
  app.patch<{ Params: { id: string }; Body: UpdateWorkflowRequest }>('/api/workflows/:id', { schema: { params: workflowParamsSchema, body: updateSchema } }, async (request) => {
    validateDraft(request.body.draft, webhookDelivery?.localReceiverUrl)
    validateConnectionBindings(request.body.draft.plan, await connections())
    return { workflow: await repository.update(request.params.id, request.body.expectedVersion, {
      ...request.body.draft, plan: refreshPlanChecks(request.body.draft.plan),
    }) }
  })
  const deliveryParams = { type: 'object', additionalProperties: false, required: ['id', 'webhookId'], properties: {
    id: { type: 'string', format: 'uuid' }, webhookId: { type: 'string', maxLength: 120, pattern: '^[A-Za-z0-9][A-Za-z0-9_.:-]*$' },
  } }
  const requireDelivery = () => {
    if (!webhookDelivery) throw new ApiError(503, 'WEBHOOK_DELIVERY_NOT_CONFIGURED', 'Webhook delivery is not configured on this backend.')
    return webhookDelivery
  }
  app.get<{ Params: { id: string; webhookId: string } }>('/api/workflows/:id/webhooks/:webhookId/deliveries', { schema: { params: deliveryParams, querystring: listQuerySchema } }, async (request) => ({
    deliveries: await requireDelivery().list(request.params.id, request.params.webhookId),
  }))
  app.post<{ Params: { id: string; webhookId: string }; Body: DeliveryRequest }>('/api/workflows/:id/webhooks/:webhookId/test-deliveries', {
    bodyLimit: 32768, schema: { params: deliveryParams, body: { type: 'object', additionalProperties: false, required: ['requestId', 'expectedVersion', 'sampleData'], properties: {
      requestId: { type: 'string', format: 'uuid' }, expectedVersion: { type: 'integer', minimum: 1, maximum: 2147483646 }, sampleData: { type: 'object', additionalProperties: true },
    } } },
  }, async (request) => ({ delivery: await requireDelivery().deliver(request.params.id, request.params.webhookId, request.body) }))
  executionRoutes(app, execution)
  return app
}
