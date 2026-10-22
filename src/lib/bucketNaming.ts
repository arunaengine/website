// Names of new uploads, sync schedules and the S3 bucket template of new buckets, as the
// group Storage tab shows them. Stored patterns keep `{dir}`; the portal shows them without it.
import type { BackendImportRun } from './api'
import { bucketError, runActive } from './storageRules'
import { formatNumber, relativeTime } from './utils'

export const SAMPLE_ID = '01JA7Q3K'
const SAMPLE_NAME = 'b.fa.gz'

export type NamingChoice = 'plain' | 'suffix' | 'prefix' | 'custom'

const NAMING_PATTERNS: Record<Exclude<NamingChoice, 'custom'>, string> = {
  plain: '{dir}{name}',
  suffix: '{dir}{name}~{id}',
  prefix: '{dir}{id}_{name}',
}

export const NAMING_OPTIONS: { value: NamingChoice; label: string }[] = [
  { value: 'plain', label: '{name}, or {name}~{id} if taken' },
  { value: 'suffix', label: '{name}~{id}' },
  { value: 'prefix', label: '{id}_{name} (old)' },
  { value: 'custom', label: 'Custom…' },
]

/** The pattern as shown: without `{dir}`, which every pattern keeps in front. */
export function shownPattern(pattern: string | null | undefined): string {
  return (pattern || NAMING_PATTERNS.plain).replaceAll('{dir}', '')
}

/** The choice a stored pattern matches; a missing one is the default. */
export function namingChoice(pattern: string | null | undefined): NamingChoice {
  const shown = shownPattern(pattern)
  const found = (Object.keys(NAMING_PATTERNS) as Exclude<NamingChoice, 'custom'>[]).find(
    (key) => shownPattern(NAMING_PATTERNS[key]) === shown,
  )
  return found ?? 'custom'
}

/** The stored pattern of a choice; a custom one is the typed text. */
export function namingPattern(choice: NamingChoice, custom: string): string {
  if (choice !== 'custom') return NAMING_PATTERNS[choice]
  const text = custom.trim()
  return text.startsWith('{dir}') ? text : `{dir}${text}`
}

export function customProblem(text: string): string | null {
  const value = text.trim()
  if (!value.includes('{name}')) return 'The name needs {name}.'
  const unknown = value.match(/\{[^}]*\}/g)?.find((part) => !['{name}', '{id}', '{dir}'].includes(part))
  if (unknown) return `Unknown placeholder ${unknown}. Use {name} and {id}.`
  if (value.startsWith('/')) return 'The name cannot start with /.'
  return null
}

/** One example name, with the fallback for a pattern without `{id}`. */
export function namingExample(pattern: string): string {
  const shown = shownPattern(pattern)
  const filled = shown.replaceAll('{name}', SAMPLE_NAME).replaceAll('{id}', SAMPLE_ID)
  return shown.includes('{id}') ? filled : `${filled} (or ${filled}~${SAMPLE_ID} if taken)`
}

export const SCHEDULE_OPTIONS = [
  { value: '', label: 'Only when I click Sync' },
  { value: '0 * * * *', label: 'Every hour' },
  { value: '0 3 * * *', label: 'Every day at 03:00' },
  { value: '0 3 * * 1', label: 'Every week' },
]

const SCHEDULE_SENTENCES: Record<string, string> = {
  '': 'Sync runs only when started.',
  '0 * * * *': 'Sync runs every hour.',
  '0 3 * * *': 'Sync runs daily at 03:00.',
  '0 3 * * 1': 'Sync runs weekly.',
}

/** The choices, with a stored custom schedule kept as its own entry. */
export function scheduleOptions(saved: string | null | undefined): { value: string; label: string }[] {
  const value = saved?.trim() ?? ''
  if (SCHEDULE_OPTIONS.some((option) => option.value === value)) return SCHEDULE_OPTIONS
  return [...SCHEDULE_OPTIONS, { value, label: `Custom: ${value} (UTC)` }]
}

export function scheduleSentence(schedule: string | null | undefined): string {
  const value = schedule?.trim() ?? ''
  return SCHEDULE_SENTENCES[value] ?? `Sync runs on the schedule ${value} (UTC).`
}

/** Buckets this large make an hourly sync a steady load on the storage. */
export const BIG_BUCKET = 100_000

/** The short sync status of a table row and its hover text. */
export function syncStatus(
  run: BackendImportRun | null | undefined,
  schedule: string | null | undefined,
): { text: string; tone: 'ok' | 'error' | 'muted'; title: string } {
  const rule = scheduleSentence(schedule)
  if (!run) return { text: 'Not synced', tone: 'muted', title: `Not synced yet. ${rule}` }
  const when = relativeTime(run.started_at)
  const found = `found ${formatNumber(run.imported)} new ${run.imported === 1 ? 'file' : 'files'}`
  if (runActive(run)) {
    return { text: 'Syncing…', tone: 'muted', title: `Sync started ${when}. ${rule}` }
  }
  if (run.state === 'succeeded') {
    return { text: `✓ ${when}`, tone: 'ok', title: `Last sync ${when}, ${found}. ${rule}` }
  }
  const error = bucketError(run)
  const reason = error ? ` ${error}` : ''
  return { text: `✕ ${when}`, tone: 'error', title: `Last sync ${when} did not finish.${reason} ${rule}` }
}

/** Why a template for one S3 bucket per Aruna bucket cannot work, or null. */
export function templateProblem(template: string, group: string): string | null {
  const value = template.trim()
  if (!value.includes('{bucket}')) return 'Needs {bucket}, so each bucket gets its own S3 bucket.'
  return S3_BUCKET.test(fillTemplate(value, 'samples', group)) ? null : 'S3 bucket names use a-z, 0-9, dots and dashes.'
}

export function sharedProblem(name: string): string | null {
  return S3_BUCKET.test(name.trim()) ? null : 'S3 bucket names use a-z, 0-9, dots and dashes.'
}

const S3_BUCKET = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/

export function fillTemplate(template: string, bucket: string, group: string): string {
  return template.trim().replaceAll('{bucket}', bucket).replaceAll('{group}', group)
}

/** A count that is a lower bound until the node finished counting. */
export function countWords(count: number, complete: boolean, noun = 'files'): string {
  return `${complete ? '' : 'at least '}${formatNumber(count)} ${count === 1 && complete ? noun.replace(/s$/, '') : noun}`
}
