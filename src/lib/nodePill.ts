// The one word and colour the desktop screens give the node on this computer.
import type { BadgeVariant } from '@/components/nodes/node-display'
import type { NodeStatus } from '@/lib/desktopBridge'

export interface NodePill {
  label: string
  variant: BadgeVariant
}

/** `paused` comes from the owner's settings; the shell status has no such flag. */
export function nodePill(status: NodeStatus | null, paused = false): NodePill {
  if (!status) return { label: 'Checking', variant: 'secondary' }
  if (status.enrolling) return { label: 'Connecting', variant: 'sky' }
  switch (status.state) {
    case 'running':
      return status.ready ? { label: 'Running', variant: 'success' } : { label: 'Starting', variant: 'sky' }
    case 'starting':
      return { label: 'Starting', variant: 'sky' }
    case 'stopped':
      return paused ? { label: 'Paused', variant: 'warn' } : { label: 'Stopped', variant: 'secondary' }
    default:
      return { label: 'Error', variant: 'destructive' }
  }
}

/** "2 days 4 hours", "35 minutes": whole units only, two at most. */
export function plainDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const parts: Array<[number, string]> = [
    [Math.floor(minutes / 1440), 'day'],
    [Math.floor((minutes % 1440) / 60), 'hour'],
    [minutes % 60, 'minute'],
  ]
  const shown = parts.filter(([count]) => count > 0).slice(0, 2)
  if (!shown.length) return 'less than a minute'
  return shown.map(([count, unit]) => `${count} ${unit}${count === 1 ? '' : 's'}`).join(' ')
}
