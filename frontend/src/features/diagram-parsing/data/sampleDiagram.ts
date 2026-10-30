import type { ParsedDiagram } from '../types'

export const sampleDiagram: ParsedDiagram = {
  id: 'support-triage',
  title: 'Support request triage',
  summary: 'Read an incoming support request and route it based on urgency.',
  nodes: [
    {
      id: 'n1', label: 'New support request', role: 'trigger', app: 'Email',
      description: 'Start the workflow when a support request arrives in the inbox.',
      position: { x: 0, y: 120 },
    },
    {
      id: 'n2', label: 'Read request details', role: 'transform',
      description: 'Extract the sender, subject, and a short summary of the request.',
      position: { x: 235, y: 120 },
    },
    {
      id: 'n3', label: 'Check urgency', role: 'decision',
      description: 'Choose the next step based on the urgency of the request.',
      reviewNote: 'Define what counts as urgent before this workflow is planned.',
      position: { x: 470, y: 120 },
    },
    {
      id: 'n4', label: 'Notify the on-call team', role: 'action', app: 'Slack',
      description: 'Send urgent requests to the on-call team for immediate attention.',
      position: { x: 725, y: 20 },
    },
    {
      id: 'n5', label: 'Add to support queue', role: 'action', app: 'Helpdesk',
      description: 'Add standard requests to the support queue for the team to pick up.',
      position: { x: 725, y: 220 },
    },
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n2', target: 'n3' },
    { id: 'e3', source: 'n3', target: 'n4', label: 'Urgent' },
    { id: 'e4', source: 'n3', target: 'n5', label: 'Standard' },
  ],
}
