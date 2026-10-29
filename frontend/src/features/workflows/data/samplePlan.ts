import { sampleDiagram } from '../../diagram-parsing/data/sampleDiagram'
import type { PlanStepConfiguration, WorkflowPlan } from '../types'

const stepConfiguration: Record<string, PlanStepConfiguration> = {
  n1: {
    operation: 'Watch the support inbox', connectionId: 'email',
    inputs: [{ name: 'inbox', description: 'A support inbox connected by the owner.' }],
    outputs: [{ name: 'message', description: 'The sender, subject, body, and message identifier.' }],
    configuration: [
      { label: 'Inbox', value: 'Select a support inbox', needsInput: true },
      { label: 'Event', value: 'New incoming message' },
    ],
    mappings: [],
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
    operation: 'Send a channel message', connectionId: 'slack',
    inputs: [{ name: 'request', description: 'Details of a request on the urgent path.' }],
    outputs: [{ name: 'notification', description: 'The message identifier returned by the connected service.' }],
    configuration: [
      { label: 'Channel', value: 'Select an on-call channel', needsInput: true },
      { label: 'Message', value: 'Include the sender, subject, and request text' },
    ],
    mappings: [
      { source: 'request.subject', target: 'message.heading' },
      { source: 'request.text', target: 'message.body' },
    ],
  },
  n5: {
    operation: 'Create a support item', connectionId: 'helpdesk',
    inputs: [{ name: 'request', description: 'Details of a request on the standard path.' }],
    outputs: [{ name: 'support_item', description: 'The identifier of the newly created support item.' }],
    configuration: [
      { label: 'Queue', value: 'Select a support queue', needsInput: true },
      { label: 'Assignment', value: 'Use the connected queue’s default assignment' },
    ],
    mappings: [
      { source: 'request.subject', target: 'support_item.title' },
      { source: 'request.text', target: 'support_item.description' },
      { source: 'request.sender', target: 'support_item.requester' },
    ],
  },
}

export const samplePlan: WorkflowPlan = {
  id: 'sample-support-triage-plan',
  sourceDiagramId: sampleDiagram.id,
  title: sampleDiagram.title,
  summary: 'Turn incoming support messages into a consistent triage process.',
  expectedOutcome: 'Urgent requests reach the on-call team; standard requests enter the support queue.',
  steps: sampleDiagram.nodes.map((node) => ({
    id: node.id, title: node.label, role: node.role, description: node.description,
    ...stepConfiguration[node.id],
  })),
  edges: sampleDiagram.edges,
  connections: [
    { id: 'email', provider: 'Email', purpose: 'Read new messages from the support inbox.', permissions: ['Read incoming support messages'] },
    { id: 'slack', provider: 'Slack', purpose: 'Notify the on-call team on the urgent path.', permissions: ['Select a channel', 'Send a channel message'] },
    { id: 'helpdesk', provider: 'Helpdesk', purpose: 'Create support items on the standard path.', permissions: ['Select a support queue', 'Create a support item'] },
  ],
  questions: [{
    id: 'urgency-rule', stepId: 'n3', question: 'What makes a support request urgent?',
    explanation: 'The diagram branches by urgency but does not define a rule. Agree on the condition before enabling this workflow.',
  }],
  checks: [
    { id: 'structure', title: 'Workflow structure', description: 'Steps and branch paths are supplied by the example diagram.', status: 'sample' },
    { id: 'connections', title: 'Application access', description: 'Required application accounts have not been connected.', status: 'pending' },
    { id: 'configuration', title: 'Required configuration', description: 'The inbox, urgency rule, channel, and queue still need values.', status: 'needs-input' },
    { id: 'execution', title: 'Execution validation', description: 'No engine validation or test execution has been performed.', status: 'not-run' },
  ],
}
