import type { WorkflowPlan } from './workflows.ts'

// Strip an expression/node namespace only when the saved field contract proves
// the unprefixed field exists. Explicitly declared nested fields always win.
export function workflowFieldCanonicalizer(plan: WorkflowPlan) {
  const declared = new Set(plan.steps.flatMap((step) => [...step.inputs, ...step.outputs].map((field) => field.name)))
  const namespaces = new Set(['data', 'context', ...plan.steps.map((step) => step.id)])
  return (path: string): string => {
    const separator = path.indexOf('.')
    if (declared.has(path) || separator < 0 || !namespaces.has(path.slice(0, separator))) return path
    const candidate = path.slice(separator + 1)
    return declared.has(candidate) ? candidate : path
  }
}
