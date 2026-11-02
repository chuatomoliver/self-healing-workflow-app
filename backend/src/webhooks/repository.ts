import type { Pool, RowDataPacket } from 'mysql2/promise'
import type { WebhookDelivery } from '../../../shared/deliveries.ts'
import { ApiError } from '../errors.ts'

export type StoredDelivery = { delivery: WebhookDelivery; fingerprint: string }
export type DeliveryIntent = { id: string; workflowId: string; workflowVersion: number; webhookId: string; fingerprint: string; runId?: string }
export type DeliveryResult = Pick<WebhookDelivery, 'status' | 'httpStatus' | 'durationMs' | 'errorCode'>
export interface DeliveryRepository {
  find(id: string): Promise<StoredDelivery | null>
  reserve(intent: DeliveryIntent): Promise<{ delivery: WebhookDelivery; created: boolean }>
  finish(id: string, result: DeliveryResult): Promise<WebhookDelivery>
  list(workflowId: string, webhookId: string): Promise<WebhookDelivery[]>
}
type DeliveryRow = RowDataPacket & {
  id: string; workflow_id: string; workflow_version: number; webhook_id: string; request_fingerprint: string
  status: WebhookDelivery['status']; http_status: number | null; duration_ms: number | null
  error_code: WebhookDelivery['errorCode']; created_at: Date; completed_at: Date | null
}
function saved(row: DeliveryRow): WebhookDelivery {
  return { id: row.id, workflowId: row.workflow_id, workflowVersion: row.workflow_version, webhookId: row.webhook_id,
    status: row.status, httpStatus: row.http_status, durationMs: row.duration_ms, errorCode: row.error_code,
    createdAt: row.created_at.toISOString(), completedAt: row.completed_at?.toISOString() ?? null }
}
export function mysqlDeliveries(pool: Pool): DeliveryRepository {
  return {
    async find(id) {
      const [rows] = await pool.execute<DeliveryRow[]>('SELECT * FROM webhook_deliveries WHERE id = ?', [id])
      return rows[0] ? { delivery: saved(rows[0]), fingerprint: rows[0].request_fingerprint } : null
    },
    async reserve(intent) {
      const client = await pool.getConnection()
      try {
        await client.beginTransaction()
        const [workflows] = await client.execute<RowDataPacket[]>('SELECT version FROM workflows WHERE id = ? FOR UPDATE', [intent.workflowId])
        if (!workflows[0]) throw new ApiError(404, 'WORKFLOW_NOT_FOUND', 'This workflow could not be found.')
        const [existing] = await client.execute<DeliveryRow[]>('SELECT * FROM webhook_deliveries WHERE id = ? FOR UPDATE', [intent.id])
        if (existing[0]) {
          if (existing[0].request_fingerprint !== intent.fingerprint) throw new ApiError(409, 'DELIVERY_ID_CONFLICT', 'This delivery ID has already been used with different data.')
          await client.commit()
          return { delivery: saved(existing[0]), created: false }
        }
        if (intent.runId) {
          const [runs] = await client.execute<RowDataPacket[]>('SELECT workflow_id, workflow_version, status FROM workflow_runs WHERE id = ?', [intent.runId])
          if (runs[0]?.workflow_id !== intent.workflowId || runs[0].workflow_version !== intent.workflowVersion || runs[0].status !== 'running') throw new ApiError(409, 'INVALID_RUN_SNAPSHOT', 'The execution no longer matches this delivery.')
        } else if (workflows[0].version !== intent.workflowVersion) throw new ApiError(409, 'VERSION_CONFLICT', 'The saved draft changed. Reopen it before sending a webhook.')
        await client.execute("INSERT INTO webhook_deliveries (id, workflow_id, workflow_version, webhook_id, request_fingerprint, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', UTC_TIMESTAMP(6))",
          [intent.id, intent.workflowId, intent.workflowVersion, intent.webhookId, intent.fingerprint])
        const [rows] = await client.execute<DeliveryRow[]>('SELECT * FROM webhook_deliveries WHERE id = ?', [intent.id])
        await client.commit()
        return { delivery: saved(rows[0]), created: true }
      } catch (error) { await client.rollback(); throw error }
      finally { client.release() }
    },
    async finish(id, result) {
      await pool.execute("UPDATE webhook_deliveries SET status = ?, http_status = ?, duration_ms = ?, error_code = ?, completed_at = UTC_TIMESTAMP(6) WHERE id = ? AND status = 'pending'",
        [result.status, result.httpStatus, result.durationMs, result.errorCode, id])
      const [rows] = await pool.execute<DeliveryRow[]>('SELECT * FROM webhook_deliveries WHERE id = ?', [id])
      if (!rows[0]) throw new Error('Delivery record missing')
      return saved(rows[0])
    },
    async list(workflowId, webhookId) {
      const [rows] = await pool.execute<DeliveryRow[]>('SELECT * FROM webhook_deliveries WHERE workflow_id = ? AND webhook_id = ? ORDER BY created_at DESC, id DESC LIMIT 20', [workflowId, webhookId])
      return rows.map(saved)
    },
  }
}
