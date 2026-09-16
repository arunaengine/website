// Public access is one group role named "public" with the public flag: read
// rules on data paths that every principal, signed in or not, may use.
import type { ApiRole, GroupPermissionLevel } from '@/lib/api'

export const PUBLIC_ROLE_NAME = 'public'

export interface PublicTarget {
  kind: 'bucket' | 'folder' | 'file'
  bucket: string
  /** Folder prefix with its trailing slash, or the file key; empty for a bucket. */
  key: string
}

export function dataRoot(realmId: string, groupId: string, nodeId: string): string {
  return `/${realmId}/g/${groupId}/data/${nodeId}`
}

/** The permission path a target is authorized under; folders cover their subtree. */
export function targetPath(root: string, target: PublicTarget): string {
  const bucket = `${root}/${target.bucket}`
  if (target.kind === 'bucket') return `${bucket}/**`
  if (target.kind === 'folder') return `${bucket}/${target.key.replace(/\/+$/, '')}/**`
  return `${bucket}/${target.key}`
}

export function ruleCovers(rule: string, path: string): boolean {
  if (rule === path) return true
  if (!rule.endsWith('/**')) return false
  const base = rule.slice(0, -3)
  const subject = path.endsWith('/**') ? path.slice(0, -3) : path
  return subject === base || subject.startsWith(`${base}/`)
}

export function readRules(role: ApiRole): string[] {
  return Object.entries(role.permissions)
    .filter(([, level]) => level.toLowerCase() === 'read')
    .map(([path]) => path)
}

/** Every public read rule, from any public role, that lets everyone read the path. */
export function coveringRules(roles: readonly ApiRole[], path: string): string[] {
  return roles
    .filter((role) => role.public)
    .flatMap(readRules)
    .filter((rule) => ruleCovers(rule, path))
}

export function managedRole(roles: readonly ApiRole[]): ApiRole | null {
  return roles.find((role) => role.public && role.name === PUBLIC_ROLE_NAME) ?? null
}

export function withGrants(
  permissions: Record<string, string> | undefined,
  paths: readonly string[],
): Record<string, GroupPermissionLevel> {
  const next: Record<string, GroupPermissionLevel> = {}
  for (const [path, level] of Object.entries(permissions ?? {})) {
    if (level.toLowerCase() === 'read') next[path] = 'read'
  }
  for (const path of paths) next[path] = 'read'
  return next
}

/** Drops the rules on the paths and everything below them; broader rules stay. */
export function withoutGrants(
  permissions: Record<string, string> | undefined,
  paths: readonly string[],
): Record<string, GroupPermissionLevel> {
  const next = withGrants(permissions, [])
  for (const rule of Object.keys(next)) {
    if (paths.some((path) => path.endsWith('/**') ? ruleCovers(path, rule) : rule === path)) {
      delete next[rule]
    }
  }
  return next
}

export interface PublicRule {
  rule: string
  target: PublicTarget
}

/** The managed role's rules inside one bucket, as the targets they name. */
export function rulesInBucket(role: ApiRole | null, root: string, bucket: string): PublicRule[] {
  if (!role) return []
  const prefix = `${root}/${bucket}/`
  return readRules(role)
    .filter((rule) => rule.startsWith(prefix))
    .sort()
    .map((rule) => {
      const rest = rule.slice(prefix.length)
      if (rest === '**') return { rule, target: { kind: 'bucket', bucket, key: '' } }
      if (rest.endsWith('/**')) {
        return { rule, target: { kind: 'folder', bucket, key: `${rest.slice(0, -3)}/` } }
      }
      return { rule, target: { kind: 'file', bucket, key: rest } }
    })
}

/** The path-style S3 address everyone can read a public target at. */
export function publicUrl(endpoint: string, target: PublicTarget): string {
  const base = `${endpoint.replace(/\/+$/, '')}/${encodeURIComponent(target.bucket)}`
  if (target.kind === 'bucket') return `${base}/`
  return `${base}/${target.key.split('/').map(encodeURIComponent).join('/')}`
}

export function targetLabel(target: PublicTarget): string {
  if (target.kind === 'bucket') return `the whole bucket ${target.bucket}`
  if (target.kind === 'folder') return `the folder ${target.key}`
  return `the file ${target.key}`
}
