// Paths and names shared by linked buckets and their checks.
import type { GroupBackendResponse } from './api'

/** A folder as the API stores it: empty, or a relative path ending with `/`. */
export function folderPath(value: string): string {
  const trimmed = value.trim().replace(/^\/+|\/+$/g, '')
  return trimmed ? `${trimmed}/` : ''
}

const STORE_KEYS = ['bucket', 'container', 'filesystem']

/** The bucket, container or filesystem a backend points at. */
export function storeName(backend: GroupBackendResponse): string {
  const key = STORE_KEYS.find((name) => backend.public_config[name])
  return key ? backend.public_config[key] : backend.name
}

/** Whether a link writes inside the folder it reads, on the same storage; such links may
 * share that folder, as the node allows. */
export function writesInside(link: {
  backend_id: string
  backend_prefix: string
  write_backend_id?: string | null
  write_prefix?: string | null
}): boolean {
  const backendId = link.write_backend_id || link.backend_id
  return backendId === link.backend_id && (link.write_prefix ?? link.backend_prefix).startsWith(link.backend_prefix)
}
