import { Link } from 'react-router'
import { workflowRoutes } from '../../../app/navigation'
export function WorkflowEmptyState({ title, description }: { title: string; description: string }) {
  return <section className="my-10 rounded-xl border border-line bg-surface px-6 py-10">
    <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
    <p className="mt-3 max-w-xl text-xs leading-relaxed text-muted">{description}</p>
    <Link to={workflowRoutes.describe} className="mt-5 inline-flex rounded-md bg-accent px-4 py-2.5 text-xs font-semibold text-white">Describe a workflow</Link>
  </section>
}
