import type { FastifyInstance } from 'fastify'
import type { StartRunRequest } from '../../../shared/execution.ts'
import type { ExecutionService } from './service.ts'
import { ApiError } from '../errors.ts'
const uuid = { type: 'string', format: 'uuid' }
const revision = { type: 'integer', minimum: 1, maximum: 2147483646 }
const object = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) })
export function executionRoutes(app: FastifyInstance, execution?: ExecutionService) {
  const requireService = () => { if (!execution) throw new ApiError(503, 'EXECUTION_NOT_CONFIGURED', 'The workflow runner is not configured on this backend.'); return execution }
  const workflowParams = object({ id: uuid }); const runParams = object({ runId: uuid }); const repairParams = object({ runId: uuid, repairId: uuid })
  app.get<{ Params: { id: string } }>('/api/workflows/:id/runs', { schema: { params: workflowParams, querystring: object({}) } }, async (request) => ({ runs: await requireService().list(request.params.id) }))
  app.post<{ Params: { id: string }; Body: StartRunRequest }>('/api/workflows/:id/runs', { bodyLimit: 40000, schema: { params: workflowParams, body: { ...object({ requestId: uuid, expectedVersion: revision, input: { type: 'object', additionalProperties: true }, autoRepair: { type: 'boolean' } }), required: ['requestId', 'expectedVersion', 'input'] } } }, async (request, reply) => reply.code(202).send({ run: await requireService().start(request.params.id, request.body) }))
  app.get<{ Params: { runId: string } }>('/api/runs/:runId', { schema: { params: runParams, querystring: object({}) } }, async (request) => ({ run: await requireService().get(request.params.runId) }))
  app.post<{ Params: { runId: string } }>('/api/runs/:runId/cancel', { schema: { params: runParams, body: object({}) } }, async (request) => ({ run: await requireService().cancel(request.params.runId) }))
  app.post<{ Params: { runId: string }; Body: { requestId: string; expectedRevision: number } }>('/api/runs/:runId/repairs', { schema: { params: runParams, body: object({ requestId: uuid, expectedRevision: revision }) } }, async (request, reply) => reply.code(202).send({ run: await requireService().proposeRepair(request.params.runId, request.body.requestId, request.body.expectedRevision) }))
  for (const action of ['reject', 'resume'] as const) app.post<{ Params: { runId: string; repairId: string }; Body: { expectedRevision: number } }>(`/api/runs/:runId/repairs/:repairId/${action}`, { schema: { params: repairParams, body: object({ expectedRevision: revision }) } }, async (request, reply) => {
    const service = requireService()
    const operation = action === 'reject' ? service.rejectRepair : service.resume
    const run = await operation(request.params.runId, request.params.repairId, request.body.expectedRevision)
    return reply.code(action === 'resume' ? 202 : 200).send({ run })
  })
}
