// Wording and checks shared by the linked folders section and its dialog.
import type { GroupBackendResponse } from './api'
import { backendSchema } from './storage'

export const NAME_PATTERNS = [
  { value: '{dir}{id}_{name}', label: 'Unique ID before the name' },
  { value: '{dir}{id}/{name}', label: 'Unique ID as folder' },
  { value: '{dir}{name}', label: 'Same name; older versions kept in a hidden folder' },
]

export const SCHEDULES = [
  { value: '', label: 'Only when started' },
  { value: '0 * * * *', label: 'Every hour' },
  { value: '0 3 * * *', label: 'Every day' },
  { value: '0 3 * * 1', label: 'Every week' },
]

const SCHEDULE_WORDS: Record<string, string> = {
  '': 'Only when started',
  '0 * * * *': 'Every hour, on the hour',
  '0 3 * * *': 'Every day at 03:00 UTC',
  '0 3 * * 1': 'Every Monday at 03:00 UTC',
}

const PLACEHOLDERS = ['{dir}', '{name}', '{id}']

/** Plain words for a stored schedule; the node reads cron in UTC. */
export function scheduleWords(schedule: string | null | undefined): string {
  const key = schedule?.trim() ?? ''
  return SCHEDULE_WORDS[key] ?? `Custom: ${key} (UTC)`
}

/** A folder as the API stores it: empty, or a relative path ending with `/`. */
export function folderPath(value: string): string {
  const trimmed = value.trim().replace(/^\/+|\/+$/g, '')
  return trimmed ? `${trimmed}/` : ''
}

/** A place as `store / folder`, or the store alone when the folder is empty. */
export function placeLabel(store: string, folder?: string | null): string {
  const path = folder?.replace(/\/+$/, '')
  return path ? `${store} / ${path}` : store
}

const STORE_KEYS = ['bucket', 'container', 'filesystem']

/** The bucket, container or filesystem a backend points at. */
export function storeName(backend: GroupBackendResponse): string {
  const key = STORE_KEYS.find((name) => backend.public_config[name])
  return key ? backend.public_config[key] : backend.name
}

/** What a backend points at, such as "S3 bucket lab". */
export function storeLabel(backend: GroupBackendResponse): string {
  const kind = backendSchema(backend.kind)?.label ?? backend.kind
  const key = STORE_KEYS.find((name) => backend.public_config[name])
  return key ? `${kind} ${key} ${backend.public_config[key]}` : kind
}

/** The store label with the endpoint, when the backend has one. */
export function storeLine(backend: GroupBackendResponse): string {
  const endpoint = backend.public_config.endpoint
  return endpoint ? `${storeLabel(backend)} at ${endpoint}` : storeLabel(backend)
}

/** True when new uploads go somewhere other than the linked folder itself. */
export function writesElsewhere(link: {
  backend_id: string
  backend_prefix: string
  write_backend_id?: string | null
  write_prefix?: string | null
}): boolean {
  const backendId = link.write_backend_id || link.backend_id
  return backendId !== link.backend_id || (link.write_prefix ?? link.backend_prefix) !== link.backend_prefix
}

export function patternProblem(pattern: string): string | null {
  if (!pattern.includes('{name}')) return 'The file name needs {name}.'
  const unknown = pattern.match(/\{[^}]*\}/g)?.find((part) => !PLACEHOLDERS.includes(part))
  if (unknown) return `Unknown placeholder ${unknown}. Use {dir}, {name} and {id}.`
  if (pattern.startsWith('/')) return 'The file name cannot start with /.'
  return null
}

export function fillPattern(pattern: string, dir: string, name: string, id: string): string {
  return pattern.replaceAll('{dir}', dir).replaceAll('{name}', name).replaceAll('{id}', id)
}

export function cronProblem(value: string): string | null {
  return value.trim().split(/\s+/).length === 5
    ? null
    : 'Use five fields: minute, hour, day of month, month and day of week.'
}
