// The portal's one state vocabulary. Every badge, dot and status colour in the
// app resolves through a tone, so the same situation never gets two colours.
export type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'outline'
  | 'success'
  | 'warn'
  | 'destructive'
  | 'accent'
  | 'royal'
  | 'sky'

export type StateTone = 'idle' | 'progress' | 'done' | 'attention' | 'failed' | 'count' | 'info'

const TONE_VARIANT: Record<StateTone, BadgeVariant> = {
  idle: 'secondary',
  progress: 'sky',
  done: 'success',
  attention: 'warn',
  failed: 'destructive',
  count: 'outline',
  info: 'accent',
}

export function toneVariant(tone: StateTone): BadgeVariant {
  return TONE_VARIANT[tone]
}

// Dot colours track the badge variants above so a dot and a badge for the same
// state never disagree.
const TONE_DOT: Record<StateTone, string> = {
  idle: 'bg-muted-foreground/50',
  progress: 'bg-aruna-sky',
  done: 'bg-emerald-500',
  attention: 'bg-amber-500',
  failed: 'bg-destructive',
  count: 'bg-border',
  info: 'bg-aruna-aqua',
}

export function toneDot(tone: StateTone): string {
  return TONE_DOT[tone]
}

// Every state string the app renders, keyed lower case. Values with the same
// meaning in different subsystems deliberately share a tone.
const STATE_TONE: Record<string, StateTone> = {
  // TES task states.
  unknown: 'count',
  queued: 'idle',
  initializing: 'progress',
  running: 'progress',
  paused: 'idle',
  complete: 'done',
  executor_error: 'failed',
  system_error: 'failed',
  canceling: 'attention',
  canceled: 'idle',
  preempted: 'attention',
  // System job states.
  claimed: 'progress',
  preparing: 'progress',
  ready: 'info',
  cancelling: 'attention',
  indeterminate: 'attention',
  succeeded: 'done',
  failed: 'failed',
  cancelled: 'idle',
  // Dataset and folder sync states.
  synced: 'done',
  pending: 'progress',
  publishing: 'progress',
  invalid: 'attention',
  local_only: 'count',
  'in sync': 'done',
  syncing: 'progress',
  'needs you': 'attention',
  error: 'failed',
  // Transfers.
  retrying: 'attention',
  done: 'done',
  // Node reachability.
  connected: 'done',
  seen: 'done',
  configured: 'attention',
  offline: 'attention',
  unreachable: 'attention',
  reachable: 'done',
}

/** The tone for a state string; anything unknown reads as a neutral count. */
export function stateTone(state: string): StateTone {
  return STATE_TONE[state.trim().toLowerCase()] ?? 'count'
}

/** Shorthand for the common `Badge :variant` binding. */
export function stateVariant(state: string): BadgeVariant {
  return toneVariant(stateTone(state))
}
