import { randomUUID } from 'node:crypto'
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import type { SavedWorkflow, WorkflowDraft, WorkflowSummary } from '../../../shared/workflows.ts'
import { ApiError } from '../errors.ts'

export interface WorkflowRepository {
  health(): Promise<void>
  list(): Promise<WorkflowSummary[]>
  get(id: string): Promise<SavedWorkflow>
  create(draft: WorkflowDraft): Promise<SavedWorkflow>
  update(id: string, expectedVersion: number, draft: WorkflowDraft): Promise<SavedWorkflow>
}
type WorkflowRow = RowDataPacket & { id: string; title: string; version: number; created_at: Date; updated_at: Date; draft: string | WorkflowDraft }
const selectCurrent = `SELECT w.*, v.draft FROM workflows w JOIN workflow_versions v ON v.workflow_id = w.id AND v.version = w.version`
function saved(row: WorkflowRow): SavedWorkflow {
  const draft: WorkflowDraft = typeof row.draft === 'string' ? JSON.parse(row.draft) : row.draft
  return { ...draft, id: row.id, version: row.version, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() }
}

export function mysqlWorkflows(pool: Pool): WorkflowRepository {
  return {
    async health() { await pool.query('SELECT 1 FROM workflows LIMIT 1') },
    async list() {
      const [rows] = await pool.execute<WorkflowRow[]>('SELECT id, title, version, created_at, updated_at FROM workflows ORDER BY updated_at DESC, id LIMIT 50')
      return rows.map((row) => ({ id: row.id, title: row.title, version: row.version, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() }))
    },
    async get(id) {
      const [rows] = await pool.execute<WorkflowRow[]>(`${selectCurrent} WHERE w.id = ?`, [id])
      if (!rows[0]) throw new ApiError(404, 'WORKFLOW_NOT_FOUND', 'This workflow could not be found.')
      return saved(rows[0])
    },
    async create(draft) {
      const client = await pool.getConnection()
      try {
        await client.beginTransaction()
        const id = randomUUID()
        await client.execute('INSERT INTO workflows (id, title, version, created_at, updated_at) VALUES (?, ?, 1, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))', [id, draft.plan.title])
        await client.execute('INSERT INTO workflow_versions (workflow_id, version, draft, created_at) VALUES (?, 1, ?, UTC_TIMESTAMP(6))', [id, JSON.stringify(draft)])
        const [rows] = await client.execute<WorkflowRow[]>(`${selectCurrent} WHERE w.id = ?`, [id])
        await client.commit()
        return saved(rows[0])
      } catch (error) {
        await client.rollback()
        throw error
      } finally { client.release() }
    },
    async update(id, expectedVersion, draft) {
      const client = await pool.getConnection()
      try {
        await client.beginTransaction()
        const [updated] = await client.execute<ResultSetHeader>('UPDATE workflows SET title = ?, version = version + 1, updated_at = UTC_TIMESTAMP(6) WHERE id = ? AND version = ?', [draft.plan.title, id, expectedVersion])
        if (!updated.affectedRows) {
          const [exists] = await client.execute<RowDataPacket[]>('SELECT id FROM workflows WHERE id = ? FOR UPDATE', [id])
          if (!exists.length) throw new ApiError(404, 'WORKFLOW_NOT_FOUND', 'This workflow could not be found.')
          throw new ApiError(409, 'VERSION_CONFLICT', 'A newer version has been saved. Reopen the workflow before saving your changes.')
        }
        await client.execute('INSERT INTO workflow_versions (workflow_id, version, draft, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP(6))', [id, expectedVersion + 1, JSON.stringify(draft)])
        const [rows] = await client.execute<WorkflowRow[]>(`${selectCurrent} WHERE w.id = ?`, [id])
        await client.commit()
        return saved(rows[0])
      } catch (error) {
        await client.rollback()
        throw error
      } finally { client.release() }
    },
  }
}
