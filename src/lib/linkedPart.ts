// A linked part is a Dataset-typed hasPart that names a bucket or a folder of a bucket. Every file
// under it is part of the dataset, and the files are always the current ones.
import type { PartTargetResponse } from '@/lib/api'
import { folderRoute } from '@/lib/crate/dataIdentity'

const W3ID_DATA = 'https://w3id.org/aruna/data/'
const CONTENT_ID = /^[0-9a-f]{64}$/

/** Whether an id spells out the node, bucket and key of a stored file or folder, bare or as a web id. */
export function isNodeArn(id: string): boolean {
  return id.startsWith('arn:aruna:') || id.startsWith(`${W3ID_DATA}arn:aruna:`)
}

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

/** Bytes to URL-safe Base64 without padding, as the node writes the prefix of a set id. */
function encodePrefix(prefix: string): string {
  let binary = ''
  for (const byte of new TextEncoder().encode(prefix)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * The id a dataset uses for a bucket or a folder: the global id URL of a set, or the bucket-prefix
 * ARN of an ordinary bucket on a node. The root of a bucket has an empty prefix.
 */
export function partId(where: { realmId: string; nodeId: string; bucket: string; prefix: string; setId: string | null }): string {
  // S3 keys may start with "/", so the prefix is kept exactly.
  const prefix = where.prefix
  if (where.setId) return `${W3ID_DATA}${where.realmId}/${where.setId}/${prefix ? encodePrefix(prefix) : ''}`
  return `arn:aruna:${where.realmId}:${where.nodeId}:s3/${where.bucket}/${prefix}`
}

// The Data section lists the folder `<prefix>/`, so only a prefix of that shape is listed exactly.
function folderPrefix(prefix: string): string | null {
  if (!prefix) return ''
  return prefix.length > 1 && prefix.endsWith('/') ? prefix.slice(0, -1) : null
}

/** The reason the files of a part cannot be listed from here, or null. Another node's bucket opens there. */
export function browseProblem(target: PartTargetResponse, isLocalNode: (nodeId: string) => boolean): string | null {
  if (!target.bucket) return 'This node has no record of the bucket yet.'
  if (folderPrefix(target.prefix) === null) return 'The Data section cannot list this part as a folder, because its path does not end in a slash.'
  if (target.held_here || (target.node_id && !isLocalNode(target.node_id))) return null
  return 'This node holds no copy of the bucket. Open the dataset on a node that does.'
}

/** The Data section at the folder of a part. A bucket of another node opens on that node. */
export function browseRoute(target: PartTargetResponse, isLocalNode: (nodeId: string) => boolean) {
  const folder = folderPrefix(target.prefix)
  const route = folderRoute(target.bucket ?? '', '')
  const node = target.node_id && !isLocalNode(target.node_id) ? { node: target.node_id } : {}
  // The prefix is kept as the part names it: no slash is trimmed from its start.
  return { ...route, query: { ...(folder ? { prefix: folder } : {}), ...node } }
}
