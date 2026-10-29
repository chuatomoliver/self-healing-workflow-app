export const workflowRoutes = {
  describe: '/',
  parse: '/parse-diagram',
  plan: '/plan-workflow',
} as const

export const workflowStages = [
  { label: 'Describe or upload', path: workflowRoutes.describe },
  { label: 'Parse diagram', path: workflowRoutes.parse },
  { label: 'Plan workflow', path: workflowRoutes.plan },
  { label: 'Run on canvas', path: null },
  { label: 'Self-heal', path: null },
  { label: 'Context & logs', path: null },
] as const
