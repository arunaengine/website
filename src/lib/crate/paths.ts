// Where a new dataset can live inside a group: the meta/ prefixes the caller's
// roles grant WRITE on, plus the folders the group's documents already use. A
// dataset lands at <prefix>/<slug> under /{realm}/g/{group}/meta/.

import type { ApiRole } from '@/lib/api'

export interface PathPrefixOption {
  value: string
  label: string
}

export interface PathPrefixInput {
  roles: ApiRole[]
  realmId: string
  groupId: string
  documentPaths: string[]
}

export interface PathPrefixes {
  options: PathPrefixOption[]
  /** The first writable prefix, or the group root when nothing narrower exists. */
  preselected: string
}

// Folders the node gives a meaning of their own; never offered for a dataset.
const RESERVED = new Set(['profiles', 'runs'])

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '')
}

/** Prefixes under meta/ the roles grant WRITE on; '' stands for the group root. */
export function writablePrefixes(roles: ApiRole[], realmId: string, groupId: string): string[] {
  const scope = `/${realmId}/g/${groupId}/`
  const found: string[] = []
  const add = (prefix: string) => {
    if (!found.includes(prefix)) found.push(prefix)
  }
  for (const role of roles) {
    for (const [path, level] of Object.entries(role.permissions)) {
      if (level.toLowerCase() !== 'write' || !path.startsWith(scope)) continue
      const suffix = trimSlashes(path.slice(scope.length))
      if (suffix === '**' || suffix === 'meta' || suffix === 'meta/**') {
        add('')
      } else if (suffix.startsWith('meta/') && suffix.endsWith('/**')) {
        add(trimSlashes(suffix.slice('meta/'.length, -'/**'.length)))
      }
      // An exact document grant covers that one path and no new sibling.
    }
  }
  return found
}

/** Every folder an existing document path sits in, ancestors included. */
export function documentPrefixes(paths: string[]): string[] {
  const found = new Set<string>()
  for (const path of paths) {
    const segments = trimSlashes(path).split('/').filter(Boolean)
    segments.pop()
    if (RESERVED.has(segments[0] ?? '')) continue
    for (let depth = 1; depth <= segments.length; depth += 1) found.add(segments.slice(0, depth).join('/'))
  }
  return [...found].sort()
}

function covered(prefix: string, grants: string[]): boolean {
  return grants.some((grant) => grant === '' || prefix === grant || prefix.startsWith(`${grant}/`))
}

export function prefixLabel(prefix: string): string {
  return prefix ? `${prefix}/` : 'Group root'
}

/**
 * The prefixes to offer, de-duplicated: the grants first, then the group's own
 * folders that fall under a grant (every folder when no grant is known, the
 * node still decides), and the group root last.
 */
export function pathPrefixOptions(input: PathPrefixInput): PathPrefixes {
  const grants = writablePrefixes(input.roles, input.realmId, input.groupId)
  const values: string[] = []
  const add = (prefix: string) => {
    if (!values.includes(prefix)) values.push(prefix)
  }
  for (const grant of grants) if (grant) add(grant)
  for (const folder of documentPrefixes(input.documentPaths)) {
    if (!grants.length || covered(folder, grants)) add(folder)
  }
  if (!grants.length || grants.includes('')) add('')
  if (!values.length) add('')
  return {
    options: values.map((value) => ({ value, label: prefixLabel(value) })),
    preselected: grants.find((grant) => grant !== '') ?? (values.includes('') ? '' : values[0]),
  }
}

export function joinPath(prefix: string, slug: string): string {
  return [trimSlashes(prefix), trimSlashes(slug)].filter(Boolean).join('/')
}

export function splitPath(path: string): { prefix: string; slug: string } {
  const segments = trimSlashes(path).split('/').filter(Boolean)
  const slug = segments.pop() ?? ''
  return { prefix: segments.join('/'), slug }
}
