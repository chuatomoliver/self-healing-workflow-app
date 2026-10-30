import { useState } from 'react'
import type { PlanWebhookTemplate, WebhookConnectionState } from '../types'

export function useWebhookConnections(templates: PlanWebhookTemplate[]) {
  const [connections, setConnections] = useState<WebhookConnectionState>({})

  // UI-only adapter. Replace with a backend-confirmed result during REST integration.
  // It does not register a webhook, send its payload, or resolve secret references.
  function connect(templateId: string) {
    if (!templates.some((template) => template.id === templateId)) return
    setConnections((current) => ({ ...current, [templateId]: 'connected-demo' }))
  }

  return { connections, connect }
}
