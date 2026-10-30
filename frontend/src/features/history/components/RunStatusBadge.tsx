import type { DemoRunFrame } from '../../canvas/types'
import { runStatusStyles } from '../presentation'

export function RunStatusBadge({ status }: { status: DemoRunFrame['status'] }) {
  const style = runStatusStyles[status]
  return <span className={`inline-flex shrink-0 rounded-md px-2 py-1 text-[9px] font-medium ${style.colors}`}>{style.label}</span>
}
