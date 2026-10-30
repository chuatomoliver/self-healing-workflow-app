export function formatHistoryTime(value: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(new Date(value))
}

export function formatRunDuration(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return 'In progress'
  const seconds = Math.max(0, (Date.parse(finishedAt) - Date.parse(startedAt)) / 1000)
  return seconds < 60 ? `${seconds.toFixed(1)}s` : `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`
}

export const runStatusStyles = {
  running: { label: 'Running', colors: 'bg-accent-soft text-accent' },
  succeeded: { label: 'Succeeded', colors: 'bg-emerald-50 text-emerald-800' },
  failed: { label: 'Failed', colors: 'bg-red-50 text-danger' },
  stopped: { label: 'Stopped', colors: 'bg-amber-50 text-amber-800' },
}

export const repairEventLabels = {
  opened: 'Repair review opened',
  verified: 'Verification passed',
  'verification-failed': 'Verification needs attention',
  rejected: 'Repair rejected',
  reopened: 'Repair review reopened',
  applied: 'Repair applied',
}
