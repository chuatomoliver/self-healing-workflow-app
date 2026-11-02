import type { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise'
import type { WorkflowRun, RunSummary, ExecutionProgram } from '../../../shared/execution.ts'
import { summarizeRun } from '../../../shared/execution.ts'
import { ApiError } from '../errors.ts'

export interface RunRepository {
  get(id: string): Promise<WorkflowRun | null>
  create(run: WorkflowRun): Promise<{ run: WorkflowRun; created: boolean }>
  update(run: WorkflowRun, revision: number): Promise<WorkflowRun>
  list(workflowId: string): Promise<RunSummary[]>
  program(workflowId: string, version: number): Promise<ExecutionProgram | null>
  interrupted(): Promise<WorkflowRun[]>
  aliases(workflowId: string, version: number): Promise<WorkflowRun['inheritedAliases']>
}
type RunRow = RowDataPacket & { document: string | WorkflowRun }
const decode = (row: RunRow): WorkflowRun => typeof row.document === 'string' ? JSON.parse(row.document) : row.document
export function mysqlRuns(pool: Pool): RunRepository {
  return {
    async get(id) { const [rows] = await pool.execute<RunRow[]>('SELECT document FROM workflow_runs WHERE id = ?', [id]); return rows[0] ? decode(rows[0]) : null },
    async create(run) {
      const client = await pool.getConnection()
      try {
        await client.beginTransaction()
        const [workflow] = await client.execute<RowDataPacket[]>('SELECT version FROM workflows WHERE id = ? FOR UPDATE', [run.workflowId])
        const [existing] = await client.execute<RunRow[]>('SELECT document FROM workflow_runs WHERE id = ? FOR UPDATE', [run.id])
        if (existing[0]) {
          const current = decode(existing[0])
          if (current.fingerprint !== run.fingerprint) throw new ApiError(409, 'RUN_ID_CONFLICT', 'This run ID is already used with different input.')
          await client.commit(); return { run: current, created: false }
        }
        if (workflow[0]?.version !== run.workflowVersion) throw new ApiError(409, 'VERSION_CONFLICT', 'The workflow changed. Reopen it before running.')
        await client.execute('INSERT INTO workflow_runs (id, workflow_id, workflow_version, revision, status, request_fingerprint, document, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [run.id, run.workflowId, run.workflowVersion, run.revision, run.status, run.fingerprint, JSON.stringify(run), new Date(run.createdAt), new Date(run.updatedAt)])
        await client.commit(); return { run, created: true }
      } catch (error) { await client.rollback(); throw error } finally { client.release() }
    },
    async update(run, revision) {
      const next = { ...run, revision: revision + 1, updatedAt: new Date().toISOString() }
      const [result] = await pool.execute<ResultSetHeader>('UPDATE workflow_runs SET revision = ?, status = ?, document = ?, updated_at = ? WHERE id = ? AND revision = ?', [next.revision, next.status, JSON.stringify(next), new Date(next.updatedAt), next.id, revision])
      if (!result.affectedRows) throw new ApiError(409, 'RUN_CHANGED', 'This run changed. Refresh it before continuing.')
      return next
    },
    async list(workflowId) { const [rows] = await pool.execute<RunRow[]>('SELECT document FROM workflow_runs WHERE workflow_id = ? ORDER BY created_at DESC, id DESC LIMIT 50', [workflowId]); return rows.map((row) => summarizeRun(decode(row))) },
    async program(workflowId, version) {
      const [rows] = await pool.execute<(RowDataPacket & { program: string | ExecutionProgram })[]>("SELECT JSON_EXTRACT(document, '$.program') AS program FROM workflow_runs WHERE workflow_id = ? AND workflow_version = ? AND JSON_TYPE(JSON_EXTRACT(document, '$.program')) = 'OBJECT' ORDER BY created_at DESC LIMIT 1", [workflowId, version])
      return rows[0] ? typeof rows[0].program === 'string' ? JSON.parse(rows[0].program) : rows[0].program : null
    },
    async interrupted() { const [rows] = await pool.execute<RunRow[]>("SELECT document FROM workflow_runs WHERE status IN ('queued', 'preparing', 'running') OR JSON_SEARCH(document, 'one', 'generating', NULL, '$.repairs[*].status') IS NOT NULL"); return rows.map(decode) },
    async aliases(workflowId, version) {
      const [rows] = await pool.execute<(RowDataPacket & { id: string; repairs: string | WorkflowRun['repairs'] })[]>("SELECT id, JSON_EXTRACT(document, '$.repairs') AS repairs FROM workflow_runs WHERE workflow_id = ? AND workflow_version = ? AND status = 'succeeded' AND JSON_LENGTH(JSON_EXTRACT(document, '$.repairs')) > 0 ORDER BY updated_at DESC LIMIT 50", [workflowId, version])
      const aliases = new Map<string, WorkflowRun['inheritedAliases'][number]>()
      for (const row of rows) for (const repair of (typeof row.repairs === 'string' ? JSON.parse(row.repairs) : row.repairs) as WorkflowRun['repairs']) {
        if (repair.status === 'applied' && !aliases.has(repair.targetPath) && aliases.size < 20) aliases.set(repair.targetPath, { sourcePath: repair.sourcePath, targetPath: repair.targetPath, fromRunId: row.id, stepId: repair.stepId })
      }
      return [...aliases.values()]
    },
  }
}
