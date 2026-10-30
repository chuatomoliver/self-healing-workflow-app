import type { DemoScenario, DemoStepResult } from '../types'
import type { WorkflowPlan } from '../../workflows/types'

const intake: DemoStepResult = {
  stepId: 'n1', message: 'Loaded support request payload.',
  output: { id: 'request-1042', from: 'customer@example.test', subject: 'Checkout service unavailable', body: 'Customers cannot complete checkout.' },
}
const extract: DemoStepResult = {
  stepId: 'n2', message: 'Mapped message fields to the request.',
  output: { sender: 'customer@example.test', subject: 'Checkout service unavailable', text: 'Customers cannot complete checkout.' },
}
const urgent: DemoStepResult = {
  stepId: 'n3', message: 'Selected urgent branch.',
  output: { route: 'urgent', source: 'input' },
}

export const sampleScenarios: DemoScenario[] = [
  {
    id: 'urgent-success', label: 'Urgent request',
    description: 'Follow the urgent branch and preview a successful on-call delivery.',
    results: [intake, extract, urgent, {
      stepId: 'n4', message: 'Notification delivery accepted · HTTP 202.',
      output: { statusCode: 202, deliveryId: 'alert-01' },
    }],
  },
  {
    id: 'standard-success', label: 'Standard request',
    description: 'Follow the standard branch and preview a successful queue handoff.',
    results: [
      { ...intake, output: { id: 'request-1043', from: 'customer@example.test', subject: 'Update billing details', body: 'Please update the billing contact for our next invoice.' } },
      { ...extract, output: { sender: 'customer@example.test', subject: 'Update billing details', text: 'Please update the billing contact for our next invoice.' } },
      { stepId: 'n3', message: 'Selected standard branch.', output: { route: 'standard', source: 'input' } },
      { stepId: 'n5', message: 'Queue handoff accepted · HTTP 202.', output: { statusCode: 202, deliveryId: 'queue-01' } },
    ],
  },
  {
    id: 'urgent-failure', label: 'Urgent request · delivery failure',
    description: 'Preview a receiver rejecting the on-call payload and inspect the failure context.',
    results: [intake, extract, urgent, {
      stepId: 'n4', message: 'Delivery rejected · HTTP 400.',
      error: 'Receiver expects "title" instead of "heading".',
      output: { statusCode: 400, error: { code: 'invalid_payload', expectedField: 'title', receivedField: 'heading' } },
    }],
  },
]

// Keep fixture playback consistent with a locally applied webhook repair.
export function getSampleScenarios(plan: WorkflowPlan): DemoScenario[] {
  const template = plan.webhooks.find((webhook) => webhook.id === 'on-call-alert')?.payloadTemplate
  if (!template || template.title !== '{{request.subject}}' || Object.hasOwn(template, 'heading')) return sampleScenarios
  return sampleScenarios.map((scenario) => scenario.id === 'urgent-failure' ? {
    ...scenario, label: 'Urgent request · repaired delivery',
    results: scenario.results.map((result) => result.stepId === 'n4' ? {
      stepId: result.stepId, message: 'Notification delivery accepted · HTTP 202.',
      output: { statusCode: 202, deliveryId: 'alert-01' },
    } : result),
  } : scenario)
}
