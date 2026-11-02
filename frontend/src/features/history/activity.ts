export type WorkflowActivity = { id: string; at: string; workflow: string; kind: 'parse' | 'plan' | 'setup' | 'save' | 'open'; status: 'completed' | 'failed' | 'cancelled'; message: string }
