export type WebhookDelivery = {
  id: string; workflowId: string; workflowVersion: number; webhookId: string
  status: 'pending' | 'succeeded' | 'failed' | 'unknown'
  httpStatus: number | null; durationMs: number | null
  errorCode: 'HTTP_REJECTED' | 'TIMEOUT' | 'NETWORK_ERROR' | null
  createdAt: string; completedAt: string | null
}
export type DeliveryRequest = { requestId: string; expectedVersion: number; sampleData: Record<string, unknown> }
