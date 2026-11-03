import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { SavedWorkflow } from '../../../shared/workflows.ts'
import type { ExecutionProgram } from '../../../shared/execution.ts'
import { ApiError } from '../errors.ts'

export type ExecutionProgramCache = {
  read(workflow: SavedWorkflow): Promise<unknown | undefined>
  write(workflow: SavedWorkflow, program: ExecutionProgram): Promise<void>
}
export function createExecutionProgramCache(directory = join(process.env.LOCALAPPDATA || join(homedir(), '.config'), 'Metaflow', 'execution')): ExecutionProgramCache {
  const key = (workflow: SavedWorkflow) => createHash('sha256').update(JSON.stringify({
    format: 1, id: workflow.id, version: workflow.version, prompt: workflow.prompt,
    steps: workflow.plan.steps, edges: workflow.plan.edges,
    webhooks: workflow.plan.webhooks.map(({ id, direction, event, payloadTemplate }) => ({ id, direction, event, payloadTemplate })),
  })).digest('hex')
  return {
    async read(workflow) {
      try {
        const content = await readFile(join(directory, `${key(workflow)}.json`), 'utf8')
        if (Buffer.byteLength(content) > 512 * 1024) throw new Error()
        const entry: unknown = JSON.parse(content)
        if (!entry || typeof entry !== 'object' || !('key' in entry) || entry.key !== key(workflow) || !('program' in entry)) throw new Error()
        return entry.program
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
        throw new ApiError(503, 'EXECUTION_CACHE_UNAVAILABLE', 'The saved execution setup could not be read. Check the local Metaflow execution cache before retrying.')
      }
    },
    async write(workflow, program) {
      const fingerprint = key(workflow)
      const temporary = join(directory, `${fingerprint}.${randomUUID()}.tmp`)
      try {
        await mkdir(directory, { recursive: true })
        // Store only the validated program, excluding transport metadata,
        // credentials, delivery endpoints, and run inputs.
        await writeFile(temporary, JSON.stringify({ key: fingerprint, program }) + '\n', { flag: 'wx', mode: 0o600 })
        await rename(temporary, join(directory, `${fingerprint}.json`))
      } catch {
        throw new ApiError(503, 'EXECUTION_CACHE_UNAVAILABLE', 'The validated execution setup could not be saved. Check the local Metaflow execution cache before retrying.')
      } finally { await rm(temporary, { force: true }).catch(() => {}) }
    },
  }
}
