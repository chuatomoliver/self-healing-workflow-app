// Static receiver contract for the support-triage UI. This is not fetched API documentation.
export const sampleRepairContract = {
  stepId: 'n4', webhookId: 'on-call-alert', requestStepId: 'n2',
  originalField: 'heading', replacementField: 'title',
  name: 'On-call notification',
  fields: [
    { name: 'event', type: 'string', required: true },
    { name: 'title', type: 'string', required: true },
    { name: 'body', type: 'string', required: true },
    { name: 'sender', type: 'string', required: true },
  ],
} as const
