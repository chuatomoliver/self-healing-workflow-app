import type { WebhookConnection } from '../../../../shared/connections.ts'
import type { WorkflowPlan } from '../../../../shared/workflows.ts'
import { refreshPlanChecks, stepSetupIssues, webhookPayloadIssue } from '../../../../shared/setup.ts'

export function connectWebhook(plan: WorkflowPlan, webhookId: string, connection: WebhookConnection): WorkflowPlan {
  const previous = plan.webhooks.find((hook) => hook.id === webhookId)
  if (!previous || previous.direction !== 'outgoing') throw new Error('Select an outgoing webhook to connect.')
  const slack = new URL(connection.endpointUrl).hostname === 'hooks.slack.com'
  const payloadReady = !webhookPayloadIssue(previous) && (!slack || (Object.keys(previous.payloadTemplate).length === 1 && !!previous.payloadTemplate.text))
  const next = structuredClone(plan)
  next.webhooks = next.webhooks.map((hook) => hook.id !== webhookId ? hook : {
    ...hook, endpoint: { kind: 'external', urlTemplate: connection.endpointUrl }, authentication: { ...connection.authentication },
    connectionId: connection.id, configuredBy: undefined, availability: undefined,
    setup: { endpointReviewed: true, authenticationReviewed: true, payloadReviewed: payloadReady },
  })
  next.steps = next.steps.map((step) => {
    if (step.webhookTemplateId !== webhookId) return step
    const updated = { ...step, operation: 'send_webhook', configuredBy: undefined,
      configuration: [...step.configuration.filter((setting) => !/^(connection|channel|webhook setup|endpoint(?: url)?|destination(?: url| address)?|authentication|credential reference)$/i.test(setting.label)),
        { label: 'Connection', value: connection.name }, ...(connection.slackChannel ? [{ label: 'Channel', value: connection.slackChannel }] : [])],
      mappings: payloadReady ? [...step.mappings.filter((mapping) => !mapping.target.startsWith('webhook.payload.')),
        ...Object.entries(previous.payloadTemplate).map(([name, value]) => ({ source: value.slice(2, -2), target: `webhook.payload.${name}` }))] : step.mappings,
    }
    return { ...updated, reviewed: !stepSetupIssues(updated).length }
  })
  const stepIds = new Set(next.steps.filter((step) => step.webhookTemplateId === webhookId).map((step) => step.id))
  next.questions = next.questions.map((question) => {
    if (!stepIds.has(question.stepId) || /\b(if|when|unless|depending)\b|based on/i.test(question.question)) return question
    if (slack && /\bchannel\b/i.test(question.question)) return { ...question, answer: connection.slackChannel ? `Use ${connection.slackChannel}, fixed by the saved connection.` : 'Use the destination channel selected in Slack when this webhook was created.' }
    if (/\b(connection|account|workspace|authentication|credential|webhook (?:url|address))\b/i.test(question.question))
      return { ...question, answer: `Use the saved ${connection.name} connection (${connection.id}).` }
    return question
  })
  return refreshPlanChecks(next)
}
