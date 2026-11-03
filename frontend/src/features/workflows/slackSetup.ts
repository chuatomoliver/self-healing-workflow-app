import type { WorkflowPlan, PlanWebhookTemplate } from '../../../../shared/workflows.ts'
import type { SlackSetupResult } from '../../../../shared/slack.ts'
import { refreshPlanChecks, stepSetupIssues } from '../../../../shared/setup.ts'

export function slackWorkflowSteps(plan: WorkflowPlan) {
  if (plan.steps.length !== 3 || plan.edges.length !== 2) return null
  const trigger = plan.steps.find((step) => step.role === 'trigger' && /manual/i.test(step.operation))
  const message = plan.steps.find((step) => step.role === 'transform')
  const slack = plan.steps.find((step) => step.role === 'action' && (/slack/i.test(`${step.operation} ${step.title}`)
    || plan.webhooks.some((hook) => hook.id === step.webhookTemplateId && hook.authentication.type === 'slack-webhook')))
  if (!trigger || !message || !slack || (!/^(set|compose|prepare)[._ -]+(message|text)$/i.test(message.operation) && !/^Set Message$/i.test(message.title))
    || !plan.edges.some((edge) => edge.source === trigger.id && edge.target === message.id)
    || !plan.edges.some((edge) => edge.source === message.id && edge.target === slack.id)) return null
  return { trigger, message, slack }
}

export function slackMessageText(plan: WorkflowPlan): string {
  return slackWorkflowSteps(plan)?.message.configuration.find((setting) => /^(message(?: text| content)?|text|content)$/i.test(setting.label))?.value ?? ''
}

export function selectSlackConnection(plan: WorkflowPlan, connections: SlackSetupResult[]): SlackSetupResult | null {
  const step = slackWorkflowSteps(plan)?.slack
  const binding = plan.webhooks.find((hook) => hook.id === step?.webhookTemplateId)?.connectionId
  // A removed explicit binding must not silently switch to a different channel.
  if (binding) return connections.find((item) => item.connection.id === binding) ?? null
  return connections.length === 1 ? connections[0] : null
}

export function setSlackMessage(plan: WorkflowPlan, text: string): WorkflowPlan {
  const steps = slackWorkflowSteps(plan)
  if (!steps || text.length > 4000) throw new Error('This message does not match the Slack workflow.')
  return refreshPlanChecks({ ...plan, steps: plan.steps.map((step) => step.id === steps.message.id ? {
    ...step, operation: 'set_message', configuredBy: undefined, reviewed: !!text.trim(),
    configuration: [{ label: 'Message text', value: text, needsInput: !text.trim() }, { label: 'Output field', value: 'notification.text', needsInput: false }],
    inputs: [], outputs: [{ name: 'notification.text', description: 'The configured Slack message.' }], mappings: [],
  } : step) })
}

export function configureSlackWorkflow(plan: WorkflowPlan, saved: SlackSetupResult, text: string): WorkflowPlan {
  const steps = slackWorkflowSteps(plan)
  if (!steps || !text.trim() || text.length > 4000 || saved.connection.authentication.type !== 'slack-webhook')
    throw new Error('Slack setup requires a manual trigger, a message step, and a Slack action.')
  const next = structuredClone(setSlackMessage(plan, text))
  next.structureReviewed = true
  let hookId = steps.slack.webhookTemplateId
  if (!hookId) {
    const base = `slack-${steps.slack.id}`.slice(0, 110)
    hookId = base
    let suffix = 2
    while (next.webhooks.some((hook) => hook.id === hookId)) hookId = `${base}-${suffix++}`
  }
  const hook: PlanWebhookTemplate = {
    id: hookId, name: 'Slack notifications', direction: 'outgoing', method: 'POST', event: 'slack.message',
    purpose: `Send the configured message to ${saved.channel}.`, suggestionReason: 'Configured using Slack setup.',
    connectionId: saved.connection.id, endpoint: { kind: 'external', urlTemplate: saved.connection.endpointUrl },
    authentication: { ...saved.connection.authentication }, payloadTemplate: { text: '{{notification.text}}' },
    setup: { endpointReviewed: true, authenticationReviewed: true, payloadReviewed: true },
  }
  next.webhooks = [...next.webhooks.filter((item) => item.id !== hookId), hook]
  next.steps = next.steps.map((step) => step.id === steps.trigger.id && !stepSetupIssues(step).length ? { ...step, reviewed: true } : step.id === steps.slack.id ? {
    ...step, operation: 'send_webhook', configuredBy: undefined, reviewed: true, webhookTemplateId: hookId,
    description: 'Send the message through the saved Slack incoming webhook.',
    configuration: [{ label: 'Connection', value: saved.connection.name }, { label: 'Channel', value: saved.channel }],
    inputs: [{ name: 'notification.text', description: 'The message to send to Slack.' }], outputs: [],
    mappings: [{ source: 'notification.text', target: 'webhook.payload.text' }],
  } : step)
  next.questions = next.questions.map((question) => {
    if (question.stepId === steps.message.id && /^(?:what (?:message|text) should (?:be sent|we send|i send)|what (?:is|should be) the message(?: text| content)?)\??$/i.test(question.question.trim()))
      return { ...question, answer: text }
    if (question.stepId !== steps.slack.id) return question
    if (/\b(if|when|unless|depending)\b|based on/i.test(question.question)) return question
    if (/\bchannel\b/i.test(question.question)) return { ...question, answer: `${saved.channel}, selected when the Slack webhook was created.` }
    if (/\b(connection|account|workspace|authentication|credential|webhook)\b/i.test(question.question))
      return { ...question, answer: `Use the saved ${saved.connection.name} connection (${saved.connection.id}).` }
    return question
  })
  return refreshPlanChecks(next)
}
