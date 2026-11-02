import { randomUUID } from 'node:crypto'
import type { ExecutableStep, ExecutionProgram, WorkflowRun } from '../../shared/execution.ts'
import { summarizeRun } from '../../shared/execution.ts'
import type { SavedWorkflow } from '../../shared/workflows.ts'
import type { RunRepository } from '../src/execution/repository.ts'
import { ApiError } from '../src/errors.ts'
import { draftFixture } from './fixtures.ts'

export const executable = (stepId: string, kind: ExecutableStep['kind'], patch: Partial<ExecutableStep> = {}): ExecutableStep => ({ stepId, kind, requiredPaths: [], rules: [], validPath: '', errorsPath: '', assignments: [], condition: { path: '', operator: 'exists', value: null }, trueTarget: '', falseTarget: '', explanation: '', ...patch })
export function executionFixture() {
  const draft = draftFixture()
  const definitions = [{ id: 'input', role: 'trigger' }, { id: 'validate', role: 'transform' }, { id: 'branch', role: 'decision' }, { id: 'enrich', role: 'transform' }, { id: 'approve', role: 'action' }, { id: 'reject', role: 'action' }] as const
  const edges = [{ id: 'e1', source: 'input', target: 'validate' }, { id: 'e2', source: 'validate', target: 'branch' }, { id: 'e3', source: 'branch', target: 'enrich', label: 'valid' }, { id: 'e4', source: 'branch', target: 'reject', label: 'invalid' }, { id: 'e5', source: 'enrich', target: 'approve' }]
  draft.diagram.nodes = definitions.map(({ id, role }, index) => ({ id, role, label: id, description: '', position: { x: index * 250, y: 0 } }))
  draft.diagram.edges = edges
  draft.plan.steps = definitions.map(({ id, role }) => ({ id, role, title: id, description: '', operation: id, reviewed: true, inputs: [], outputs: [], mappings: [], configuration: role === 'decision' ? [{ label: 'Rule', value: 'Valid goes to enrich; invalid goes to reject.' }] : [], ...(['approve', 'reject'].includes(id) ? { webhookTemplateId: id } : {}) }))
  draft.plan.edges = edges; draft.plan.structureReviewed = true
  draft.plan.webhooks = ['approve', 'reject'].map((id) => ({ ...structuredClone(draftFixture().plan.webhooks[0]), id, name: id, event: `order.${id}`, endpoint: { kind: 'external', urlTemplate: 'https://receiver.example.com/events' }, setup: { endpointReviewed: true, authenticationReviewed: true, payloadReviewed: true }, payloadTemplate: { order_id: '{{order.id}}' } }))
  draft.plan.steps.filter((step) => step.webhookTemplateId).forEach((step) => { step.mappings = [{ source: 'order.id', target: 'webhook.payload.order_id' }] })
  const workflow: SavedWorkflow = { ...draft, id: randomUUID(), version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  const program: ExecutionProgram = { steps: [
    executable('input', 'input'),
    executable('validate', 'validate', { validPath: 'order.valid', errorsPath: 'order.validation_errors', rules: [
      { condition: { path: 'order.id', operator: 'nonempty', value: null }, message: 'Order id is required.' },
      { condition: { path: 'order.total', operator: 'number', value: null }, message: 'Total must be numeric.' },
      { condition: { path: 'order.total', operator: 'gte', value: 0 }, message: 'Total must be nonnegative.' },
      { condition: { path: 'order.currency', operator: 'eq', value: 'PHP' }, message: 'Currency must be PHP.' },
    ] }),
    executable('branch', 'branch', { condition: { path: 'order.valid', operator: 'eq', value: true }, trueTarget: 'enrich', falseTarget: 'reject' }),
    executable('enrich', 'assign', { assignments: [
      { target: 'order.priority', kind: 'choose', source: '', value: 'high', template: '', condition: { path: 'order.total', operator: 'gte', value: 10000 }, otherwise: 'normal' },
      { target: 'order.summary', kind: 'template', source: '', value: null, template: 'Order {{order.id}} total {{order.total}} {{order.currency}}', condition: { path: '', operator: 'exists', value: null }, otherwise: null },
    ] }),
    executable('approve', 'webhook'), executable('reject', 'webhook'),
  ] }
  return { workflow, program }
}
export function memoryRuns(): RunRepository & { records: Map<string, WorkflowRun> } {
  const records = new Map<string, WorkflowRun>()
  return {
    records,
    get: async (id) => records.has(id) ? structuredClone(records.get(id)!) : null,
    create: async (run) => {
      const existing = records.get(run.id)
      if (existing) { if (existing.fingerprint !== run.fingerprint) throw new ApiError(409, 'RUN_ID_CONFLICT', 'Run ID conflict'); return { run: structuredClone(existing), created: false } }
      records.set(run.id, structuredClone(run)); return { run: structuredClone(run), created: true }
    },
    update: async (run, revision) => { if (records.get(run.id)?.revision !== revision) throw new ApiError(409, 'RUN_CHANGED', 'Run changed'); const saved = { ...structuredClone(run), revision: revision + 1, updatedAt: new Date().toISOString() }; records.set(run.id, saved); return structuredClone(saved) },
    list: async (workflowId) => [...records.values()].filter((run) => run.workflowId === workflowId).reverse().map(summarizeRun),
    program: async (workflowId, version) => structuredClone([...records.values()].reverse().find((run) => run.workflowId === workflowId && run.workflowVersion === version && run.program)?.program ?? null),
    interrupted: async () => structuredClone([...records.values()].filter((run) => ['queued', 'preparing', 'running'].includes(run.status) || run.repairs.some((repair) => repair.status === 'generating'))),
    aliases: async (workflowId, version) => [...records.values()].filter((run) => run.workflowId === workflowId && run.workflowVersion === version && run.status === 'succeeded').flatMap((run) => run.repairs.filter((repair) => repair.status === 'applied').map((repair) => ({ sourcePath: repair.sourcePath, targetPath: repair.targetPath, fromRunId: run.id, stepId: repair.stepId }))),
  }
}
