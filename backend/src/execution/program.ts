import { Ajv } from 'ajv'
import type { Condition, ExecutionProgram, RunData, Scalar } from '../../../shared/execution.ts'
import type { SavedWorkflow } from '../../../shared/workflows.ts'
import { ApiError } from '../errors.ts'

const object = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) })
const text = (maxLength = 1000) => ({ type: 'string', maxLength })
const list = (items: Record<string, unknown>, maxItems = 40) => ({ type: 'array', items, maxItems })
const scalar = { type: ['string', 'number', 'boolean', 'null'], maxLength: 1000 }
const condition = object({ path: text(200), operator: { type: 'string', enum: ['exists', 'nonempty', 'number', 'eq', 'neq', 'gte', 'gt', 'lte', 'lt'] }, value: scalar })
export const programSchema = object({ steps: { ...list(object({
  stepId: text(120), kind: { type: 'string', enum: ['input', 'validate', 'assign', 'branch', 'webhook', 'unsupported'] },
  requiredPaths: list(text(200)), rules: list(object({ condition, message: text(300) })), validPath: text(200), errorsPath: text(200),
  assignments: list(object({ target: text(200), kind: { type: 'string', enum: ['copy', 'constant', 'template', 'choose'] }, source: text(200), value: scalar, template: text(), condition, otherwise: scalar })),
  condition, trueTarget: text(120), falseTarget: text(120), explanation: text(),
})), minItems: 1 } })
const validate = new Ajv({ strict: false, allowUnionTypes: true }).compile(programSchema)
export const validPath = (path: string) => path.length <= 200 && /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*){0,8}$/.test(path) && !path.split('.').some((part) => ['__proto__', 'prototype', 'constructor'].includes(part))
export class StepError extends Error {
  code: string; missingPath?: string
  constructor(code: string, message: string, missingPath?: string) { super(message); this.code = code; this.missingPath = missingPath }
}
export function readPath(data: RunData, path: string): unknown {
  if (!validPath(path)) throw new StepError('INVALID_FIELD_PATH', 'A field path is not supported.')
  let value: unknown = data
  for (const part of path.split('.')) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(value, part)) return undefined
    value = (value as RunData)[part]
  }
  return value
}
export function requiredValue(data: RunData, path: string): unknown {
  const value = readPath(data, path)
  if (value === undefined) throw new StepError('MISSING_FIELD', `The input is missing ${path}.`, path)
  return value
}
export function writePath(data: RunData, path: string, value: unknown) {
  if (!validPath(path)) throw new StepError('INVALID_FIELD_PATH', 'A field path is not supported.')
  const parts = path.split('.'); let target = data
  for (const part of parts.slice(0, -1)) {
    if (!Object.hasOwn(target, part)) target[part] = {}
    const child = target[part]
    if (!child || typeof child !== 'object' || Array.isArray(child)) throw new StepError('FIELD_CONFLICT', 'A field path conflicts with an existing value.')
    target = child as RunData
  }
  target[parts.at(-1)!] = structuredClone(value)
}
export function validateData(data: RunData) {
  let nodes = 0
  const visit = (value: unknown, depth: number) => {
    if (++nodes > 5000 || depth > 12) throw new ApiError(400, 'RUN_INPUT_INVALID', 'Run data is too deeply nested or has too many fields.')
    if (typeof value === 'number' && !Number.isFinite(value)) throw new ApiError(400, 'RUN_INPUT_INVALID', 'Use finite numbers in run data.')
    if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new ApiError(400, 'RUN_INPUT_INVALID', 'Run data contains a reserved field name.')
      visit(child, depth + 1)
    }
  }
  visit(data, 0)
  if (Buffer.byteLength(JSON.stringify(data)) > 32768) throw new ApiError(413, 'RUN_INPUT_TOO_LARGE', 'Run data must fit within 32 KB.')
}
export function evaluateCondition(data: RunData, rule: Condition): boolean {
  const value = readPath(data, rule.path)
  if (rule.operator === 'exists') return value !== undefined && value !== null
  if (rule.operator === 'nonempty') return typeof value === 'string' ? !!value.trim() : Array.isArray(value) ? !!value.length : value !== undefined && value !== null
  if (rule.operator === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (value === undefined) return false
  if (rule.operator === 'eq') return value === rule.value
  if (rule.operator === 'neq') return value !== rule.value
  if (typeof value !== 'number' || typeof rule.value !== 'number') return false
  return rule.operator === 'gte' ? value >= rule.value : rule.operator === 'gt' ? value > rule.value : rule.operator === 'lte' ? value <= rule.value : value < rule.value
}
export function parseProgram(output: unknown, workflow: SavedWorkflow): ExecutionProgram {
  const invalid = () => new ApiError(502, 'MUSE_INVALID_PROGRAM', 'Muse could not prepare a consistent executable workflow. No steps were run.')
  if (!validate(output)) throw invalid()
  const program = structuredClone(output) as ExecutionProgram
  // Some providers add an expression-root or node namespace. Resolve it only
  // when the saved field contract proves the exact canonical path, without
  // renaming real source-data fields or guessing values.
  const known = new Set([
    ...workflow.plan.steps.flatMap((step) => [...step.inputs, ...step.outputs].map((field) => field.name)),
    ...workflow.plan.webhooks.flatMap((hook) => Object.values(hook.payloadTemplate).map((reference) => reference.slice(2, -2))),
  ])
  const namespaces = new Set(['data', 'context', ...workflow.plan.steps.map((step) => step.id)])
  const canonical = (path: string) => {
    const separator = path.indexOf('.')
    if (known.has(path) || separator < 0 || !namespaces.has(path.slice(0, separator))) return path
    const candidate = path.slice(separator + 1)
    return known.has(candidate) ? candidate : path
  }
  for (const step of program.steps) {
    step.requiredPaths = step.requiredPaths.map(canonical)
    step.validPath = canonical(step.validPath); step.errorsPath = canonical(step.errorsPath)
    step.condition.path = canonical(step.condition.path)
    step.rules.forEach((rule) => { rule.condition.path = canonical(rule.condition.path) })
    step.assignments.forEach((assignment) => {
      assignment.source = canonical(assignment.source); assignment.target = canonical(assignment.target); assignment.condition.path = canonical(assignment.condition.path)
      assignment.template = assignment.template.replace(/\{\{([^{}]+)\}\}/g, (_match, path: string) => `{{${canonical(path)}}}`)
    })
  }
  const steps = workflow.plan.steps
  if (program.steps.length !== steps.length || new Set(program.steps.map((step) => step.stepId)).size !== steps.length) throw invalid()
  const path = (value: string) => { if (!validPath(value)) throw invalid() }
  const conditionPath = (rule: Condition) => path(rule.path)
  const roots = steps.filter((step) => !workflow.plan.edges.some((edge) => edge.target === step.id))
  if (roots.length !== 1 || roots[0].role !== 'trigger') throw new ApiError(400, 'EXECUTION_UNSUPPORTED', 'Runs currently require one manual input trigger and an acyclic workflow.')
  for (const executable of program.steps) {
    const original = steps.find((step) => step.id === executable.stepId)
    if (!original) throw invalid()
    const allowed = { trigger: ['input'], transform: ['validate', 'assign'], decision: ['branch'], action: ['webhook'] }
    if (executable.kind === 'unsupported') throw new ApiError(400, 'EXECUTION_UNSUPPORTED', 'One or more steps require a connector or operation that this runner does not support. Review the workflow before running.')
    if (!allowed[original.role].includes(executable.kind)) throw invalid()
    executable.requiredPaths.forEach(path)
    if (executable.kind === 'input' && roots[0].id !== executable.stepId) throw invalid()
    if (executable.kind === 'validate') {
      if (!executable.rules.length) throw invalid()
      path(executable.validPath); path(executable.errorsPath)
      if (executable.validPath === executable.errorsPath) throw invalid()
      executable.rules.forEach((rule) => conditionPath(rule.condition))
    }
    if (executable.kind === 'assign') {
      if (!executable.assignments.length) throw invalid()
      for (const assignment of executable.assignments) {
        path(assignment.target)
        if (assignment.kind === 'copy') path(assignment.source)
        if (assignment.kind === 'choose') conditionPath(assignment.condition)
        if (assignment.kind === 'template') {
          const matches = [...assignment.template.matchAll(/\{\{([^{}]+)\}\}/g)]
          matches.forEach((match) => path(match[1]))
          if (assignment.template.replace(/\{\{([^{}]+)\}\}/g, '').includes('{{')) throw invalid()
        }
      }
    }
    const outgoing = workflow.plan.edges.filter((edge) => edge.source === original.id)
    if (executable.kind === 'branch') {
      conditionPath(executable.condition)
      if (outgoing.length !== 2 || executable.trueTarget === executable.falseTarget || !outgoing.some((edge) => edge.target === executable.trueTarget) || !outgoing.some((edge) => edge.target === executable.falseTarget)) throw invalid()
    } else if (outgoing.length > 1) throw new ApiError(400, 'EXECUTION_UNSUPPORTED', 'Use a decision step for branching. Parallel side-effect execution is not supported yet.')
    if (executable.kind === 'webhook' && !workflow.plan.webhooks.some((hook) => hook.id === original.webhookTemplateId && hook.direction === 'outgoing')) throw invalid()
  }
  return structuredClone(program)
}
export function executeLocalStep(program: ExecutionProgram['steps'][number], input: RunData): { context: RunData; selectedTarget?: string } {
  const context = structuredClone(input)
  program.requiredPaths.forEach((path) => requiredValue(context, path))
  if (program.kind === 'validate') {
    const errors = program.rules.filter((rule) => !evaluateCondition(context, rule.condition)).map((rule) => rule.message)
    writePath(context, program.validPath, errors.length === 0); writePath(context, program.errorsPath, errors)
  }
  if (program.kind === 'assign') for (const assignment of program.assignments) {
    let value: unknown = assignment.value as Scalar
    if (assignment.kind === 'copy') value = requiredValue(context, assignment.source)
    if (assignment.kind === 'choose') value = evaluateCondition(context, assignment.condition) ? assignment.value : assignment.otherwise
    if (assignment.kind === 'template') value = assignment.template.replace(/\{\{([^{}]+)\}\}/g, (_match, path: string) => {
      const field = requiredValue(context, path)
      if (field && typeof field === 'object') throw new StepError('FIELD_TYPE', 'A text template requires scalar values.')
      return String(field ?? '')
    })
    writePath(context, assignment.target, value)
  }
  validateData(context)
  return { context, ...(program.kind === 'branch' ? { selectedTarget: evaluateCondition(context, program.condition) ? program.trueTarget : program.falseTarget } : {}) }
}
export function availableFields(data: RunData): { path: string; type: string }[] {
  const fields: { path: string; type: string }[] = []
  const visit = (value: RunData, prefix = '', depth = 0) => {
    if (depth > 8 || fields.length >= 200) return
    for (const [key, item] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key
      if (!validPath(path)) continue
      if (item && typeof item === 'object' && !Array.isArray(item)) visit(item as RunData, path, depth + 1)
      else if (fields.length < 200) fields.push({ path, type: Array.isArray(item) ? 'array' : item === null ? 'null' : typeof item })
    }
  }
  visit(data); return fields
}
