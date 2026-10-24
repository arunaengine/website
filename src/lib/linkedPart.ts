// A linked part is a Dataset-typed hasPart that names a bucket or a folder of a bucket. Every file
// under it is part of the dataset, and the files are always the current ones.
import type { PartTargetResponse } from '@/lib/api'
import { folderRoute } from '@/lib/crate/dataIdentity'

const W3ID_DATA = 'https://w3id.org/aruna/data/'
const CONTENT_ID = /^[0-9a-f]{64}$/

/**
 * Whether an id may name a bucket or a folder: the bucket-prefix ARN of an ordinary bucket, or the
 * global id URL of a set (`/{realm}/{set}/` or `/{realm}/{set}/{prefix}`). The node decides.
 */
export function looksLikePart(id: string): boolean {
  if (id.startsWith('arn:aruna:')) return id.includes(':s3/') && !id.includes('@')
  if (!id.startsWith(W3ID_DATA)) return false
  const parts = id.slice(W3ID_DATA.length).split('/')
  return parts.length >= 3 && !CONTENT_ID.test(parts[0]) && Boolean(parts[0] && parts[1])
}

/** The reason the files of a part cannot be listed from this node, or null. */
export function browseProblem(target: PartTargetResponse): string | null {
  if (!target.bucket) return 'This node has no record of the bucket yet.'
  if (!target.held_here) return 'This node holds no copy of the bucket. Open the dataset on a node that does.'
  return null
}

/** The Data section at the folder of a part. A bucket of another node opens on that node. */
export function browseRoute(target: PartTargetResponse, isLocalNode: (nodeId: string) => boolean) {
  const route = folderRoute(target.bucket ?? '', target.prefix)
  const node = target.node_id && !isLocalNode(target.node_id) ? { node: target.node_id } : {}
  return { ...route, query: { ...route.query, ...node } }
}
