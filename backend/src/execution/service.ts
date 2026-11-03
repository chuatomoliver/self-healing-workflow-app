import { createHash, randomUUID } from 'node:crypto'
import type { ExecutionProgram, RunFailure, RunRepair, StartRunRequest, WorkflowRun } from '../../../shared/execution.ts'
import type { SavedWorkflow } from '../../../shared/workflows.ts'
import { workflowSetupSummary } from '../../../shared/setup.ts'
import { ApiError } from '../errors.ts'
import type { WorkflowRepository } from '../workflows/repository.ts'
import type { WebhookDeliveryService } from '../webhooks/service.ts'
import type { RunRepository } from './repository.ts'
import { availableFields, executeLocalStep, parseProgram, readPath, requiredValue, StepError, validateData, validPath, writePath } from './program.ts'
import { createMuseCompiler, createMuseRepairer, parseRepair } from '../muse/execution.ts'
import { workflowFieldCanonicalizer } from '../../../shared/fieldPaths.ts'
import type { MuseCompiler, MuseRepairer } from '../muse/execution.ts'

const now = () => new Date().toISOString()
const active = (run: WorkflowRun) => ['queued', 'preparing', 'running'].includes(run.status)
const event = (run: WorkflowRun, message: string, level: 'info' | 'success' | 'error' = 'info', stepId?: string) => {
  run.events.push({ id: randomUUID(), at: now(), level, message, ...(stepId ? { stepId } : {}) })
}
function failure(error: unknown): RunFailure {
  if (error instanceof StepError) return { code: error.code, message: error.message, ...(error.missingPath ? { missingPath: error.missingPath } : {}) }
  if (error instanceof ApiError) return { code: error.code, message: error.message }
  return { code: 'EXECUTION_UNAVAILABLE', message: 'The operation could not be completed. Check its saved history before trying again.' }
}
function orderedSteps(workflow: SavedWorkflow): string[] {
  const pending = new Set(workflow.plan.steps.map((step) => step.id)); const result: string[] = []
  while (pending.size) {
    const next = [...pending].find((id) => workflow.plan.edges.filter((edge) => edge.target === id).every((edge) => !pending.has(edge.source)))
    if (!next) throw new StepError('INVALID_GRAPH', 'The workflow contains a cycle.')
    pending.delete(next); result.push(next)
  }
  return result
}
export function repairChecks(run: WorkflowRun, repair: RunRepair) {
  const canonical = workflowFieldCanonicalizer(run.snapshot.plan)
  const failed = run.steps.find((step) => step.status === 'failed')
  const missing = failed?.attempts.at(-1)?.error?.missingPath
  const source = validPath(repair.sourcePath) ? readPath(run.context, repair.sourcePath) : undefined
  let preserves = false
  try { const copy = structuredClone(run.context); writePath(copy, repair.targetPath, source); validateData(copy); preserves = true } catch { /* Fail closed. */ }
  const priorReads = run.program?.steps.filter((step) => run.steps.some((state) => state.stepId === step.stepId && state.status === 'succeeded')).flatMap((step) => [
    ...step.requiredPaths,
    ...(step.kind === 'validate' ? step.rules.map((rule) => rule.condition.path) : []),
    ...(step.kind === 'branch' ? [step.condition.path] : []),
    ...step.assignments.flatMap((assignment) => assignment.kind === 'copy' ? [assignment.source] : assignment.kind === 'choose' ? [assignment.condition.path] : assignment.kind === 'template' ? [...assignment.template.matchAll(/\{\{([^{}]+)\}\}/g)].map((match) => match[1]) : []),
    ...(step.kind === 'webhook' ? Object.values(run.snapshot.plan.webhooks.find((hook) => hook.id === run.snapshot.plan.steps.find((item) => item.id === step.stepId)?.webhookTemplateId)?.payloadTemplate ?? {}).map((reference) => canonical(reference.slice(2, -2))) : []),
  ]) ?? []
  const earlierResultsUnchanged = !priorReads.some((path) => path === repair.targetPath || path.startsWith(repair.targetPath + '.') || repair.targetPath.startsWith(path + '.'))
  return [
    { title: 'Existing source field', passed: source !== undefined && availableFields(run.context).some((field) => field.path === repair.sourcePath), detail: 'The proposed source exists in the saved checkpoint.' },
    { title: 'Missing target only', passed: !!missing && missing === repair.targetPath && validPath(repair.targetPath) && readPath(run.context, repair.targetPath) === undefined, detail: 'Only the field reported missing can be added.' },
    { title: 'Original data preserved', passed: preserves && earlierResultsUnchanged && repair.targetPath !== repair.sourcePath, detail: 'The alias preserves original fields and cannot invalidate a completed step or branch decision.' },
    { title: 'Failed-step checkpoint', passed: run.status === 'failed' && failed?.stepId === repair.stepId && failed.attempts.at(-1)?.number === repair.attempt, detail: 'The failed attempt matches; completed steps will not run again.' },
  ]
}

export function createExecutionService(options: { workflows: WorkflowRepository; runs: RunRepository; delivery: WebhookDeliveryService; compile?: MuseCompiler; repair?: MuseRepairer }) {
  const compile = options.compile ?? createMuseCompiler(); const suggestRepair = options.repair ?? createMuseRepairer()
  const tasks = new Map<string, Promise<void>>(); const programs = new Map<string, Promise<ExecutionProgram>>()
  async function get(id: string) { const run = await options.runs.get(id); if (!run) throw new ApiError(404, 'RUN_NOT_FOUND', 'This run could not be found.'); return run }
  async function mutate(id: string, update: (run: WorkflowRun) => void) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const run = await get(id); update(run)
      try { return await options.runs.update(run, run.revision) }
      catch (error) { if (!(error instanceof ApiError) || error.code !== 'RUN_CHANGED' || attempt === 7) throw error }
    }
    throw new ApiError(409, 'RUN_CHANGED', 'The run changed. Refresh before continuing.')
  }
  async function program(workflow: SavedWorkflow, onCompile: () => Promise<void>): Promise<ExecutionProgram> {
    const key = `${workflow.id}/${workflow.version}`
    if (programs.has(key)) return programs.get(key)!
    const preparing = (async () => {
      const cached = await options.runs.program(workflow.id, workflow.version)
      if (cached) return parseProgram(cached, workflow)
      await onCompile()
      return parseProgram(await compile(workflow, AbortSignal.timeout(110000)), workflow)
    })()
    programs.set(key, preparing)
    try { return await preparing } catch (error) { programs.delete(key); throw error }
    finally { if (programs.size > 100) programs.delete(programs.keys().next().value!) }
  }
  function launch(id: string) {
    if (tasks.has(id)) return
    const task = execute(id).catch(async (error: unknown) => {
      // A worker/storage interruption cannot authorize replaying a possible external side effect.
      try { await mutate(id, (run) => { if (active(run)) { run.status = 'unknown'; run.failure = failure(error); run.completedAt = now(); event(run, 'Execution was interrupted. Check delivery history before starting another run.', 'error') } }) } catch { /* Durable pending state is reconciled on restart. */ }
    }).finally(() => tasks.delete(id))
    tasks.set(id, task)
  }
  async function execute(id: string) {
    let run = await get(id)
    try {
      if (!run.program) {
        run = await mutate(id, (item) => { item.status = 'preparing'; event(item, 'Loading execution setup for this saved version.') })
        const compiled = await program(run.snapshot, async () => { await mutate(id, (item) => event(item, 'Muse is preparing the executable definition for this saved version.')) })
        run = await mutate(id, (item) => { item.program = compiled; item.status = 'running'; event(item, 'Executable configuration validated. Starting workflow.') })
      } else {
        const checked = parseProgram(run.program, run.snapshot)
        run = await mutate(id, (item) => { item.program = checked; item.status = 'running'; event(item, 'Resuming from the failed-step checkpoint with validated field references.') })
      }
    } catch (error) {
      await mutate(id, (item) => { item.status = item.cancelRequested ? 'cancelled' : 'failed'; item.failure = failure(error); item.completedAt = now(); event(item, item.failure.message, 'error') }); return
    }
    for (const stepId of orderedSteps(run.snapshot)) {
      run = await get(id)
      if (run.cancelRequested) { await mutate(id, (item) => { item.status = 'cancelled'; item.completedAt = now(); event(item, 'Stopped after the current operation. Completed deliveries were kept.') }); return }
      const state = run.steps.find((step) => step.stepId === stepId)!
      if (state.status === 'succeeded' || state.status === 'skipped') continue
      const incoming = run.snapshot.plan.edges.filter((edge) => edge.target === stepId)
      const enabled = !incoming.length || incoming.some((edge) => {
        const parent = run.steps.find((step) => step.stepId === edge.source)!
        return parent.status === 'succeeded' && (!parent.selectedTarget || parent.selectedTarget === stepId)
      })
      if (!enabled) { await mutate(id, (item) => { item.steps.find((step) => step.stepId === stepId)!.status = 'skipped'; event(item, 'Skipped because this branch was not selected.', 'info', stepId) }); continue }
      for (const alias of run.inheritedAliases.filter((alias) => alias.stepId === stepId && !alias.applied)) {
        if (!validPath(alias.sourcePath) || !validPath(alias.targetPath) || readPath(run.context, alias.targetPath) !== undefined || readPath(run.context, alias.sourcePath) === undefined) continue
        const candidate: RunRepair = { id: '', stepId, attempt: 1, status: 'proposed', title: '', explanation: '', sourcePath: alias.sourcePath, targetPath: alias.targetPath, createdAt: now(), resolvedAt: null, checks: [] }
        // Check the same dependency boundary as an approved repair, before this step starts.
        const checkpoint = structuredClone(run)
        checkpoint.status = 'failed'; const state = checkpoint.steps.find((step) => step.stepId === stepId)!
        state.status = 'failed'; state.attempts.push({ number: 1, status: 'failed', startedAt: now(), completedAt: now(), input: checkpoint.context, error: { code: 'MISSING_FIELD', message: '', missingPath: alias.targetPath } })
        if (!repairChecks(checkpoint, candidate).every((check) => check.passed)) continue
        run = await mutate(id, (item) => { writePath(item.context, alias.targetPath, requiredValue(item.context, alias.sourcePath)); item.inheritedAliases.find((item) => item.targetPath === alias.targetPath && item.stepId === stepId)!.applied = true; event(item, `Reused approved field alias ${alias.sourcePath} → ${alias.targetPath} from run ${alias.fromRunId}.`, 'info', stepId) })
      }
      const executable = run.program!.steps.find((step) => step.stepId === stepId)!
      const deliveryId = executable.kind === 'webhook' ? randomUUID() : undefined
      run = await mutate(id, (item) => {
        const step = item.steps.find((step) => step.stepId === stepId)!
        step.status = 'running'; step.attempts.push({ number: step.attempts.length + 1, status: 'running', startedAt: now(), completedAt: null, input: structuredClone(item.context), definition: structuredClone(executable), ...(deliveryId ? { deliveryId } : {}) })
        event(item, 'Step started.', 'info', stepId)
      })
      let delivery: Awaited<ReturnType<WebhookDeliveryService['deliver']>> | undefined
      try {
        const result = executeLocalStep(executable, run.context)
        if (executable.kind === 'webhook') {
          const planStep = run.snapshot.plan.steps.find((step) => step.id === stepId)!
          const hook = run.snapshot.plan.webhooks.find((hook) => hook.id === planStep.webhookTemplateId)!
          const canonical = workflowFieldCanonicalizer(run.snapshot.plan)
          for (const reference of Object.values(hook.payloadTemplate)) requiredValue(result.context, canonical(reference.slice(2, -2)))
          delivery = await options.delivery.deliver(run.workflowId, hook.id, { requestId: deliveryId!, expectedVersion: run.workflowVersion, sampleData: result.context }, run.snapshot, run.id)
          if (delivery.status !== 'succeeded') throw new StepError(delivery.status === 'unknown' || delivery.status === 'pending' ? 'DELIVERY_UNKNOWN' : 'RECEIVER_REJECTED', delivery.httpStatus ? `The receiver returned HTTP ${delivery.httpStatus}.` : 'The delivery outcome is uncertain. Check the receiver before retrying.')
        }
        await mutate(id, (item) => {
          item.context = result.context
          const step = item.steps.find((step) => step.stepId === stepId)!; const attempt = step.attempts.at(-1)!
          step.status = 'succeeded'; if (result.selectedTarget) step.selectedTarget = result.selectedTarget
          Object.assign(attempt, { status: 'succeeded', completedAt: now(), output: structuredClone(result.context), ...(delivery ? { delivery } : {}) })
          event(item, result.selectedTarget ? `Selected branch to ${result.selectedTarget}.` : delivery ? `Receiver accepted the webhook (HTTP ${delivery.httpStatus}).` : 'Step completed.', 'success', stepId)
        })
      } catch (error) {
        const failedRun = await mutate(id, (item) => {
          const issue = failure(error); const uncertain = issue.code === 'DELIVERY_UNKNOWN' || issue.code === 'DELIVERY_RESULT_UNAVAILABLE'
          const step = item.steps.find((step) => step.stepId === stepId)!; const attempt = step.attempts.at(-1)!
          step.status = uncertain ? 'unknown' : 'failed'
          Object.assign(attempt, { status: step.status, completedAt: now(), error: issue, ...(delivery ? { delivery } : {}) })
          item.status = uncertain ? 'unknown' : 'failed'; item.failure = issue; item.completedAt = now()
          event(item, issue.message, 'error', stepId)
        })
        if (failedRun.autoRepair && failedRun.status === 'failed' && failedRun.failure?.code === 'MISSING_FIELD' && !failedRun.cancelRequested) {
          try { await service.proposeRepair(id, randomUUID(), failedRun.revision) } catch { /* The recorded failure remains reviewable; no retries. */ }
        }
        return
      }
    }
    await mutate(id, (item) => { item.status = 'succeeded'; item.completedAt = now(); delete item.failure; event(item, 'Workflow completed. Unselected branches were skipped.', 'success') })
  }
  const service = {
    get,
    list: (workflowId: string) => options.runs.list(workflowId),
    async start(workflowId: string, input: StartRunRequest) {
      validateData(input.input)
      const fingerprint = createHash('sha256').update(JSON.stringify([workflowId, input.expectedVersion, input.input, !!input.autoRepair])).digest('hex')
      const existing = await options.runs.get(input.requestId)
      if (existing) { if (existing.fingerprint !== fingerprint) throw new ApiError(409, 'RUN_ID_CONFLICT', 'This run ID was used with different input.'); return existing }
      if (tasks.size >= 2) throw new ApiError(429, 'RUN_BUSY', 'Two operations are already active. Wait for a run to finish.')
      const workflow = await options.workflows.get(workflowId)
      if (workflow.version !== input.expectedVersion) throw new ApiError(409, 'VERSION_CONFLICT', 'Reopen the saved workflow before running.')
      if (!workflowSetupSummary(workflow.plan).complete) throw new ApiError(400, 'RUN_SETUP_REQUIRED', 'Complete the workflow setup and save the draft before running.')
      if (workflow.plan.steps.length > 40 || workflow.plan.steps.some((step) => step.role === 'action' && !workflow.plan.webhooks.some((hook) => hook.id === step.webhookTemplateId && hook.direction === 'outgoing'))) throw new ApiError(400, 'EXECUTION_UNSUPPORTED', 'This runner supports up to 40 manual-input, validation, transformation, decision, and outgoing-webhook steps. Native app actions need an enabled connector.')
      const stamp = now()
      const run: WorkflowRun = { id: input.requestId, workflowId, workflowVersion: workflow.version, fingerprint, revision: 1, status: 'queued', input: structuredClone(input.input), context: structuredClone(input.input), snapshot: workflow, program: null, steps: workflow.plan.steps.map((step) => ({ stepId: step.id, status: 'pending', attempts: [] })), events: [], repairs: [], inheritedAliases: [], autoRepair: !!input.autoRepair, cancelRequested: false, createdAt: stamp, updatedAt: stamp, completedAt: null }
      event(run, `Run queued for saved workflow version ${workflow.version}.`)
      run.inheritedAliases = await options.runs.aliases(workflowId, workflow.version)
      const created = await options.runs.create(run)
      if (created.created) launch(run.id)
      return created.run
    },
    async cancel(id: string) { return mutate(id, (run) => { if (!active(run)) throw new ApiError(409, 'RUN_FINISHED', 'This run is no longer active.'); run.cancelRequested = true; event(run, 'Stop requested. The current operation will finish before stopping.') }) },
    async proposeRepair(id: string, requestId: string, expectedRevision: number) {
      const run = await get(id)
      if (run.repairs.some((repair) => repair.id === requestId)) return run
      if (run.repairs.some((repair) => ['generating', 'proposed'].includes(repair.status))) return run
      if (run.revision !== expectedRevision) throw new ApiError(409, 'RUN_CHANGED', 'Refresh the run before requesting a repair.')
      const failed = run.steps.find((step) => step.status === 'failed')
      const last = failed?.attempts.at(-1)
      if (run.repairs.length >= 10) throw new ApiError(400, 'REPAIR_LIMIT', 'This run has reached its repair review limit. Correct the workflow or input before starting a new run.')
      if (run.status !== 'failed' || last?.error?.code !== 'MISSING_FIELD' || !last.error.missingPath) throw new ApiError(400, 'REPAIR_NOT_AVAILABLE', 'AI repair can currently resolve missing-field mappings. Delivery uncertainty, credentials, unsupported operations, and other failures need manual attention.')
      if (tasks.size >= 2) throw new ApiError(429, 'RUN_BUSY', 'Wait for an active operation to finish.')
      const repair: RunRepair = { id: requestId, stepId: failed!.stepId, attempt: last.number, status: 'generating', title: 'Preparing a repair', explanation: '', sourcePath: '', targetPath: '', checks: [], createdAt: now(), resolvedAt: null }
      run.repairs.push(repair); event(run, 'Requested a Muse field-mapping repair.', 'info', failed!.stepId)
      const saved = await options.runs.update(run, expectedRevision)
      const task = (async () => {
        try {
          const suggestion = parseRepair(await suggestRepair(saved, AbortSignal.timeout(110000)))
          await mutate(id, (item) => {
            const candidate = item.repairs.find((item) => item.id === requestId)!
            Object.assign(candidate, suggestion)
            candidate.checks = repairChecks(item, candidate)
            candidate.status = candidate.checks.every((check) => check.passed) ? 'proposed' : 'unavailable'
            if (candidate.status === 'unavailable') candidate.explanation = suggestion.explanation || 'No safe field alias could be verified. Correct the source data before starting a new run.'
            event(item, candidate.status === 'proposed' ? 'Muse proposed a verified field alias. Review it before resuming.' : 'No safe automatic repair was found.', 'info', candidate.stepId)
          })
        } catch (error) {
          await mutate(id, (item) => { const candidate = item.repairs.find((item) => item.id === requestId)!; candidate.status = 'unavailable'; candidate.explanation = failure(error).message; event(item, candidate.explanation, 'error', candidate.stepId) })
        }
      })().finally(() => tasks.delete(`repair:${requestId}`))
      tasks.set(`repair:${requestId}`, task)
      // Always attach a handler, including when durable error recording also fails.
      void task.catch(() => {})
      return saved
    },
    async rejectRepair(id: string, repairId: string, expectedRevision: number) {
      const run = await get(id)
      if (run.revision !== expectedRevision) throw new ApiError(409, 'RUN_CHANGED', 'Refresh the run before deciding.')
      const repair = run.repairs.find((item) => item.id === repairId)
      if (!repair || repair.status !== 'proposed') throw new ApiError(409, 'REPAIR_CHANGED', 'This proposal is no longer awaiting a decision.')
      repair.status = 'rejected'; repair.resolvedAt = now(); event(run, 'Repair rejected. No data was changed.', 'info', repair.stepId)
      return options.runs.update(run, expectedRevision)
    },
    async resume(id: string, repairId: string, expectedRevision: number) {
      const run = await get(id)
      if (run.revision !== expectedRevision) throw new ApiError(409, 'RUN_CHANGED', 'Refresh the run before resuming.')
      const repair = run.repairs.find((item) => item.id === repairId)
      if (!repair || repair.status !== 'proposed' || !repairChecks(run, repair).every((check) => check.passed)) throw new ApiError(409, 'REPAIR_CHANGED', 'This repair no longer matches the failed checkpoint.')
      if (tasks.has(id) || tasks.size >= 2) throw new ApiError(429, 'RUN_BUSY', 'Wait for the current operation to finish.')
      writePath(run.context, repair.targetPath, requiredValue(run.context, repair.sourcePath)); validateData(run.context)
      repair.status = 'applied'; repair.resolvedAt = now()
      run.steps.find((step) => step.stepId === repair.stepId)!.status = 'pending'
      run.status = 'queued'; run.completedAt = null; run.cancelRequested = false; delete run.failure
      event(run, `Applied field alias ${repair.sourcePath} → ${repair.targetPath}. Resuming without replaying completed steps.`, 'info', repair.stepId)
      const saved = await options.runs.update(run, expectedRevision); launch(id); return saved
    },
    async recover() {
      for (const run of await options.runs.interrupted()) await mutate(run.id, (item) => {
        if (active(item)) { item.status = 'unknown'; item.completedAt = now(); item.failure = { code: 'SERVER_INTERRUPTED', message: 'The server stopped during this run. Check external deliveries before starting a new run.' }; item.steps.filter((step) => step.status === 'running').forEach((step) => { step.status = 'unknown'; const attempt = step.attempts.at(-1); if (attempt) { attempt.status = 'unknown'; attempt.completedAt = now() } }); event(item, item.failure.message, 'error') }
        item.repairs.filter((repair) => repair.status === 'generating').forEach((repair) => { repair.status = 'unavailable'; repair.explanation = 'The server stopped while preparing this repair. No repair was applied.'; event(item, repair.explanation, 'error', repair.stepId) })
      })
    },
    async drain() { while (tasks.size) await Promise.allSettled([...tasks.values()]) },
  }
  return service
}
export type ExecutionService = ReturnType<typeof createExecutionService>
