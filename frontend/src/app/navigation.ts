export const workflowRoutes = {
  describe: '/',
  parse: '/parse-diagram',
  plan: '/plan-workflow',
  canvas: '/run-on-canvas',
  heal: '/self-heal',
} as const

export const workflowStages = [
  { label: 'Describe or upload', path: workflowRoutes.describe },
  { label: 'Parse diagram', path: workflowRoutes.parse },
  { label: 'Plan workflow', path: workflowRoutes.plan },
  { label: 'Run on canvas', path: workflowRoutes.canvas },
  { label: 'Self-heal', path: workflowRoutes.heal },
  { label: 'Context & logs', path: null },
] as const
