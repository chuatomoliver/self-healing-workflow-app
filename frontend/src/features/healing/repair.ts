import type { DemoRunFrame } from '../canvas/types'
import type { WorkflowPlan } from '../workflows/types'
import { sampleRepairContract as contract } from './data/sampleRepairContract.ts'
import type { FailedRunSnapshot, RepairCheck, RepairProposal } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function createRepairProposal(plan: WorkflowPlan, snapshot: FailedRunSnapshot): RepairProposal | null {
  const { frame } = snapshot
  const step = plan.steps.find((item) => item.id === contract.stepId)
  const webhook = plan.webhooks.find((item) => item.id === step?.webhookTemplateId)
  const response = frame.outputs[contract.stepId]
  const error = response?.error
  const request = frame.outputs[contract.requestStepId]
  if (frame.status !== 'failed' || frame.failure?.stepId !== contract.stepId || !step ||
    webhook?.id !== contract.webhookId || !request || response?.statusCode !== 400 || !isRecord(error) ||
    error.code !== 'invalid_payload' || error.expectedField !== contract.replacementField || error.receivedField !== contract.originalField ||
    !Object.hasOwn(webhook.payloadTemplate, contract.originalField) || Object.hasOwn(webhook.payloadTemplate, contract.replacementField)) return null

  // Resolve only the known request.* bindings; never evaluate code or arbitrary expressions.
  const originalPayload: Record<string, string> = {}
  for (const [field, binding] of Object.entries(webhook.payloadTemplate)) {
    const match = /^\{\{request\.([a-zA-Z_]+)\}\}$/.exec(binding)
    const value = match ? request[match[1]] : binding
    if (typeof value !== 'string') return null
    originalPayload[field] = value
  }
  const rename = (fields: Record<string, string>) => Object.fromEntries(Object.entries(fields).map(([field, value]) => [field === contract.originalField ? contract.replacementField : field, value]))
  const repairedMappings = step.mappings.map((mapping) => mapping.target === `webhook.payload.${contract.originalField}`
    ? { ...mapping, target: `webhook.payload.${contract.replacementField}` } : { ...mapping })

  return {
    id: `${snapshot.runId}-${step.id}-field-rename`, stepId: step.id, webhookId: webhook.id,
    title: 'Use title for the notification heading',
    explanation: 'Rename heading to title while preserving the subject, message body, and sender.',
    originalPayload, repairedPayload: rename(originalPayload),
    originalTemplate: { ...webhook.payloadTemplate }, repairedTemplate: rename(webhook.payloadTemplate),
    originalMappings: step.mappings.map((mapping) => ({ ...mapping })), repairedMappings,
    response, originalField: contract.originalField, replacementField: contract.replacementField,
  }
}

export function verifyRepair(proposal: RepairProposal): RepairCheck[] {
  const { originalPayload: before, repairedPayload: after, originalField, replacementField } = proposal
  const requiredFields = contract.fields.every((field) => typeof after[field.name] === 'string' && after[field.name].trim().length > 0)
  const renamePreserved = Object.hasOwn(before, originalField) && !Object.hasOwn(after, originalField) && after[replacementField] === before[originalField]
  const otherFieldsPreserved = Object.keys(after).length === Object.keys(before).length && Object.entries(before)
    .filter(([field]) => field !== originalField).every(([field, value]) => after[field] === value)
  const mappingIndex = proposal.originalMappings.findIndex((mapping) => mapping.target === `webhook.payload.${originalField}`)
  const mappingsValid = mappingIndex >= 0 && proposal.repairedMappings.length === proposal.originalMappings.length && proposal.originalMappings.every((mapping, index) => {
    const updated = proposal.repairedMappings[index]
    return updated?.source === mapping.source && updated.target === (index === mappingIndex ? `webhook.payload.${replacementField}` : mapping.target)
  })
  const templatesValid = JSON.stringify(proposal.repairedTemplate) === JSON.stringify(Object.fromEntries(Object.entries(proposal.originalTemplate)
    .map(([field, value]) => [field === originalField ? replacementField : field, value])))

  return [
    { id: 'schema', title: 'Required fields', passed: requiredFields, detail: 'Event, title, body, and sender are present.' },
    { id: 'rename', title: 'Field rename', passed: renamePreserved, detail: 'Title keeps the original heading value.' },
    { id: 'integrity', title: 'Payload integrity', passed: otherFieldsPreserved, detail: 'Other payload fields remain unchanged.' },
    { id: 'mapping', title: 'Template & mapping', passed: mappingsValid && templatesValid, detail: 'The payload template and step mapping use title.' },
  ]
}

export function applyRepairToPlan(plan: WorkflowPlan, proposal: RepairProposal): WorkflowPlan {
  const step = plan.steps.find((item) => item.id === proposal.stepId)
  const webhook = plan.webhooks.find((item) => item.id === proposal.webhookId)
  if (!verifyRepair(proposal).every((check) => check.passed) ||
    step?.webhookTemplateId !== proposal.webhookId ||
    JSON.stringify(step.mappings) !== JSON.stringify(proposal.originalMappings) ||
    JSON.stringify(webhook?.payloadTemplate) !== JSON.stringify(proposal.originalTemplate)) {
    throw new Error('The repair no longer matches the workflow. Review it again.')
  }
  return {
    ...plan,
    steps: plan.steps.map((item) => item.id === proposal.stepId ? { ...item, mappings: proposal.repairedMappings.map((mapping) => ({ ...mapping })) } : item),
    webhooks: plan.webhooks.map((item) => item.id === proposal.webhookId ? { ...item, payloadTemplate: { ...proposal.repairedTemplate } } : item),
  }
}

// Local replay fixture: preserve successful steps and replay only the failed delivery.
export function createRepairReplay(snapshot: FailedRunSnapshot, proposal: RepairProposal): DemoRunFrame[] {
  const original = snapshot.frame
  const otherStepsComplete = Object.entries(original.stepStates).every(([id, state]) => id === proposal.stepId ? state === 'failed' : state === 'succeeded' || state === 'skipped')
  if (original.status !== 'failed' || original.failure?.stepId !== proposal.stepId || !otherStepsComplete || !verifyRepair(proposal).every((check) => check.passed)) {
    throw new Error('A verified repair and its failed run are required to resume.')
  }
  const outputs = { ...original.outputs }
  delete outputs[proposal.stepId]
  const running: DemoRunFrame = {
    status: 'running', stepStates: { ...original.stepStates, [proposal.stepId]: 'running' }, outputs,
    events: [...original.events, { stepId: proposal.stepId, level: 'info', message: 'Repair applied. Resuming webhook delivery.' }],
  }
  const completed: DemoRunFrame = {
    ...running, status: 'succeeded', stepStates: { ...running.stepStates, [proposal.stepId]: 'succeeded' },
    outputs: { ...outputs, [proposal.stepId]: { statusCode: 202, deliveryId: 'alert-01', payload: { ...proposal.repairedPayload } } },
    events: [...running.events, { stepId: proposal.stepId, level: 'success', message: 'Notification delivery accepted · HTTP 202.' }],
  }
  return [running, completed]
}
