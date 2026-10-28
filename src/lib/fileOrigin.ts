// How the portal says where a file version came from. The node sends ids and a record; this turns
// them into the sentences of the file details. What a dataset may say is the node's projection.
import type { OriginProjection, OriginResponse } from '@/lib/api'

export type Origin =
  | { kind: 'upload'; user: string; node: string; time: string; device?: string }
  | { kind: 'source'; source: string; path: string; url?: string; etag?: string; digest?: string; database?: string }
  | { kind: 'copy'; from: string }
  | { kind: 'sync'; sync: string; from: string }
  | { kind: 'storage'; folder: string; key: string }
  | { kind: 'job'; run: string }

export interface OriginLabels {
  user: (userId: string) => string
  node: (nodeId: string) => string
  backend: (backendId: string) => string
}

function originOfUrl(url: string | null | undefined): string {
  try {
    return url ? new URL(url).origin : ''
  } catch {
    return ''
  }
}

/** The origin record of a version; null for a version minted without one. */
export function originFrom(response: OriginResponse, labels: OriginLabels): Origin | null {
  const origin = response.origin
  if (!origin) return null
  switch (origin.kind) {
    case 'upload':
      return {
        kind: 'upload',
        user: labels.user(response.created_by),
        node: labels.node(origin.node_id),
        time: response.created_at,
        ...(origin.device ? { device: origin.device } : {}),
      }
    case 'source': {
      const source = response.source
      const digest = source?.digests[0]
      return {
        kind: 'source',
        source: originOfUrl(source?.url),
        path: source?.path ?? '',
        ...(source?.url ? { url: source.url } : {}),
        ...(source?.etag ? { etag: source.etag } : {}),
        ...(digest ? { digest: `${digest.algorithm}:${digest.digest}` } : {}),
        ...(response.bucket_metadata?.database ? { database: response.bucket_metadata.title || 'a database' } : {}),
      }
    }
    case 'copy':
      return { kind: 'copy', from: origin.from }
    case 'storage':
      return { kind: 'storage', folder: labels.backend(origin.backend_id), key: origin.key }
    case 'job':
      return { kind: 'job', run: origin.run_id }
  }
}

/** The sync that carried the version here, kept apart from its origin. */
export function hopFrom(response: OriginResponse): Origin | null {
  const hop = response.hop
  return hop ? { kind: 'sync', sync: hop.relationship_id, from: hop.from } : null
}

/** One statement a dataset may add, in words. */
export interface ProjectionRow {
  key: string
  property: 'isBasedOn' | 'CreateAction' | 'identifier'
  value: string
  url?: string
}

export function projectionRows(projection: readonly OriginProjection[]): ProjectionRow[] {
  return projection.map((item): ProjectionRow => {
    switch (item.property) {
      case 'isBasedOn':
        return { key: `based:${item.id}`, property: 'isBasedOn', value: item.id }
      case 'CreateAction':
        return { key: `run:${item.run_id}`, property: 'CreateAction', value: item.run_id }
      case 'identifier':
        return { key: `id:${item.name}:${item.value}`, property: 'identifier', value: `${item.name} ${item.value}`, url: item.url }
    }
  })
}
