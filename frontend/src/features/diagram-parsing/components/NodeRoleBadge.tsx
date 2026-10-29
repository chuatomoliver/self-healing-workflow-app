import type { DiagramNodeRole } from '../types'
import { nodeRoles } from '../presentation'

export function NodeRoleBadge({ role }: { role: DiagramNodeRole }) {
  const presentation = nodeRoles[role]

  return <span className={`inline-flex rounded-md px-2 py-1 text-[10px] font-medium ${presentation.colors}`}>
    {presentation.label}
  </span>
}
