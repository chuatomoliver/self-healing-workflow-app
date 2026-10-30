import { sampleDiagram } from '../../diagram-parsing/data/sampleDiagram'
import type { PlanStepConfiguration, WorkflowPlan } from '../types'
import { sampleWebhooks } from './sampleWebhooks'

const stepConfiguration: Record<string, PlanStepConfiguration> = {
  n1: {
    operation: 'Receive a support webhook', webhookTemplateId: 'support-intake',
    inputs: [{ name: 'webhook.payload', description: 'The incoming support-request event.' }],
    outputs: [{ name: 'message', description: 'The sender, subject, body, and message identifier from the payload.' }],
    configuration: [
      { label: 'Trigger', value: 'Incoming webhook · POST' },
      { label: 'Event', value: 'support.request.received' },
    ],
    mappings: [
      { source: 'webhook.payload.id', target: 'message.id' },
      { source: 'webhook.payload.from', target: 'message.from' },
      { source: 'webhook.payload.subject', target: 'message.subject' },
      { source: 'webhook.payload.body', target: 'message.body' },
    ],
  },
  n2: {
    operation: 'Extract request fields',
    inputs: [{ name: 'message', description: 'The incoming support message.' }],
    outputs: [{ name: 'request', description: 'Normalized sender, subject, and request text.' }],
    configuration: [{ label: 'Fields', value: 'Sender, subject, request text' }],
    mappings: [
      { source: 'message.from', target: 'request.sender' },
      { source: 'message.subject', target: 'request.subject' },
      { source: 'message.body', target: 'request.text' },
    ],
  },
  n3: {
    operation: 'Route by urgency',
    inputs: [{ name: 'request.text', description: 'The request text to evaluate against an agreed rule.' }],
    outputs: [{ name: 'route', description: 'Urgent or standard, after the urgency rule is defined.' }],
    configuration: [
      { label: 'Urgency rule', value: 'Define what qualifies as urgent', needsInput: true },
      { label: 'Urgent path', value: 'Notify the on-call team' },
      { label: 'Standard path', value: 'Add to support queue' },
    ],
    mappings: [],
  },
  n4: {
    operation: 'Send an on-call webhook', webhookTemplateId: 'on-call-alert',
    inputs: [{ name: 'request', description: 'Details of a request on the urgent path.' }],
    outputs: [{ name: 'delivery', description: 'The delivery result returned by the webhook receiver.' }],
    configuration: [
      { label: 'Delivery', value: 'Outgoing webhook · POST' },
      { label: 'Event', value: 'support.request.urgent' },
    ],
    mappings: [
      { source: 'request.subject', target: 'webhook.payload.heading' },
      { source: 'request.text', target: 'webhook.payload.body' },
      { source: 'request.sender', target: 'webhook.payload.sender' },
    ],
  },
  n5: {
    operation: 'Send a support-queue webhook', webhookTemplateId: 'support-queue',
    inputs: [{ name: 'request', description: 'Details of a request on the standard path.' }],
    outputs: [{ name: 'delivery', description: 'The delivery result returned by the support queue receiver.' }],
    configuration: [
      { label: 'Delivery', value: 'Outgoing webhook · POST' },
      { label: 'Event', value: 'support.request.queued' },
    ],
    mappings: [
      { source: 'request.subject', target: 'webhook.payload.title' },
      { source: 'request.text', target: 'webhook.payload.description' },
      { source: 'request.sender', target: 'webhook.payload.requester' },
    ],
  },
}

export const samplePlan: WorkflowPlan = {
  id: 'support-triage-plan',
  sourceDiagramId: sampleDiagram.id,
  title: sampleDiagram.title,
  summary: 'Turn incoming support messages into a consistent triage process.',
  expectedOutcome: 'Urgent requests reach the on-call team; standard requests enter the support queue.',
  steps: sampleDiagram.nodes.map((node) => ({
    id: node.id, title: node.label, role: node.role, description: node.description,
    ...stepConfiguration[node.id],
  })),
  edges: sampleDiagram.edges,
  webhooks: sampleWebhooks,
  questions: [{
    id: 'urgency-rule', stepId: 'n3', question: 'What makes a support request urgent?',
    explanation: 'Define the condition for the urgent branch.',
  }],
  checks: [
    { id: 'structure', title: 'Workflow structure', description: 'Review steps and branch paths.', status: 'pending' },
    { id: 'webhooks', title: 'Webhook setup', description: 'Configure endpoints and authentication.', status: 'pending' },
    { id: 'configuration', title: 'Required configuration', description: 'Define the urgency rule.', status: 'needs-input' },
    { id: 'execution', title: 'Execution validation', description: 'Validate before activation.', status: 'not-run' },
  ],
}
