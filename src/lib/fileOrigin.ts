// How the portal says where a file version came from. The node sends ids and a record; this turns
// them into the sentences of the file details. What a dataset may say is the node's projection.
import type { OriginProjection, OriginResponse, UploadClient } from '@/lib/api'

export type Origin =
  | { kind: 'upload'; user: string; node: string; time: string; device?: string; client?: UploadClient }
  | { kind: 'source'; source: string; path: string; url?: string; etag?: string; digest?: string; database?: string; connector?: string }
  | { kind: 'copy'; from: string }
  | { kind: 'sync'; sync: string; from: string }
  | { kind: 'storage'; folder: string; key: string }
  | { kind: 'job'; run: string; startedBy?: string }

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
        ...(origin.device ? { device: labels.node(origin.device) } : {}),
        ...(origin.client ? { client: origin.client } : {}),
      }
    case 'source': {
      const source = response.source
      const digest = source?.digests[0]
      const connector = source?.sources?.[0]?.connector_name
      return {
        kind: 'source',
        source: originOfUrl(source?.url),
        path: source?.path ?? '',
        ...(source?.url ? { url: source.url } : {}),
        ...(source?.etag ? { etag: source.etag } : {}),
        ...(digest ? { digest: `${digest.algorithm}:${digest.digest}` } : {}),
        ...(response.bucket_metadata?.database ? { database: response.description?.title || 'a database' } : {}),
        ...(connector ? { connector } : {}),
      }
    }
    case 'copy':
      return { kind: 'copy', from: origin.from }
    case 'storage':
      return { kind: 'storage', folder: labels.backend(origin.backend_id), key: origin.key }
    case 'job':
      return { kind: 'job', run: origin.run_id, ...(origin.started_by ? { startedBy: labels.user(origin.started_by) } : {}) }
  }
}

/** How an upload came in, such as "from the portal"; empty when not recorded. */
export function uploadVia(origin: { device?: string; client?: UploadClient }): string {
  if (origin.client === 'portal') return 'from the portal'
  if (origin.client === 's3') return 'via S3'
  if (origin.device) return `from device ${origin.device}`
  return origin.client === 'device' ? 'from a device' : ''
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
