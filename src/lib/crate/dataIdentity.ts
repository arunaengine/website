// One decision for the identity of a picked object (decision Q15): the content
// w3id the node resolves it to, so search and backlinks find it, with the
// bucket location in contentUrl. Offline, or when the node cannot answer, the
// location is the identity. The picker and the upload path both come here.

import {
  ARUNA_CONTENT_W3ID_PREFIX,
  arunaContentReference,
  resolveContentIdentity,
  type ContentIdentityOptions,
} from '@/lib/contentIdentity'
import { isAbsoluteUri } from '@/lib/profiles/uri'

export interface DataEntityIdentity {
  /** The entity's `@id`: the content w3id when resolvable, else the location. */
  id: string
  /** Where the bytes are, always written so a reader can resolve either form. */
  contentUrl: string
}

export function objectLocation(bucket: string, key: string): string {
  return `s3://${bucket}/${key}`
}

export async function dataEntityIdentity(
  bucket: string,
  key: string,
  options: ContentIdentityOptions = {},
): Promise<DataEntityIdentity> {
  const contentUrl = objectLocation(bucket, key)
  const resolved = arunaContentReference(contentUrl, await resolveContentIdentity(bucket, key, options))
  return { id: resolved.id, contentUrl }
}

/** What a data entity's `@id` and `contentUrl` say about its bytes, in any written form. */
export interface ParsedDataIdentity {
  /** The content w3id (`https://w3id.org/aruna/data/<blake3 hex>`). */
  contentId: string | null
  s3: { bucket: string; key: string } | null
  /** Node and version of an older versioned ARN `@id`. */
  arn: { realmId: string; nodeId: string; version: string } | null
  /** Path inside the crate, from `localPath` or a relative `@id`. */
  localPath: string | null
}

const CONTENT_ID = /^https:\/\/w3id\.org\/aruna\/data\/[0-9a-f]{64}$/i
const ARN_ID = /^arn:aruna:([^:]+):([^:]+):s3\/([^/]+)\/(.+)@([^@/]+)$/

export function isContentId(value: string | null | undefined): value is string {
  return Boolean(value && CONTENT_ID.test(value))
}

function decodeKey(key: string): string {
  try {
    return decodeURIComponent(key)
  } catch {
    return key
  }
}

// s3://bucket/key (a trailing ?versionId pins a version), or path-style on the node endpoint.
export function parseObjectUrl(url: string, endpoint?: string | null): { bucket: string; key: string } | null {
  let rest: string | null = null
  if (url.startsWith('s3://')) rest = url.slice('s3://'.length).replace(/\?versionId=[^/]*$/, '')
  else if (endpoint) {
    const base = endpoint.replace(/\/+$/, '')
    if (url.startsWith(`${base}/`)) rest = decodeKey(url.slice(base.length + 1))
  }
  if (rest === null) return null
  const slash = rest.indexOf('/')
  const bucket = rest.slice(0, slash)
  const key = rest.slice(slash + 1)
  return slash > 0 && key ? { bucket, key } : null
}

function parseArnId(id: string) {
  if (!id.startsWith(ARUNA_CONTENT_W3ID_PREFIX)) return null
  const match = ARN_ID.exec(id.slice(ARUNA_CONTENT_W3ID_PREFIX.length))
  if (!match) return null
  const [, realmId, nodeId, bucket, key, version] = match as unknown as string[]
  return { arn: { realmId, nodeId, version }, s3: { bucket, key: decodeKey(key) } }
}

// Reads every form: the current one (content w3id `@id`, s3 `contentUrl`), an
// older versioned ARN `@id` with a content w3id `contentUrl`, an s3 `@id`, or a relative `@id`.
export function parseDataIdentity(
  entity: { id: string; contentUrl?: string | null; localPath?: string | null },
  endpoint?: string | null,
): ParsedDataIdentity {
  const { id } = entity
  const contentUrl = entity.contentUrl ?? ''
  const versioned = parseArnId(id)
  const relative = Boolean(id) && !id.startsWith('#') && !isAbsoluteUri(id)
  return {
    contentId: isContentId(id) ? id : isContentId(contentUrl) ? contentUrl : null,
    s3: parseObjectUrl(contentUrl, endpoint) ?? parseObjectUrl(id, endpoint) ?? versioned?.s3 ?? null,
    arn: versioned?.arn ?? null,
    localPath: entity.localPath || (relative ? id : null),
  }
}

/** The data browser opened at a folder; `prefix` may end in a slash. */
export function folderRoute(bucket: string, prefix: string, groupId?: string | null) {
  const folder = prefix.replace(/^\/+|\/+$/g, '')
  return {
    name: 'bucket',
    params: { bucketId: bucket },
    query: { ...(folder ? { prefix: folder } : {}), ...(groupId ? { group: groupId } : {}) },
  }
}

/** The data browser opened at one object's folder with its details, or at a folder key. */
export function objectRoute(bucket: string, key: string) {
  if (key.endsWith('/')) return folderRoute(bucket, key)
  const route = folderRoute(bucket, key.includes('/') ? key.slice(0, key.lastIndexOf('/')) : '')
  return { ...route, query: { ...route.query, object: key } }
}

/** The bucket a dataset stores its files in while nobody chose one. */
export function defaultStorageBucket(groupId: string): string {
  return `datasets-${groupId.toLowerCase()}`
}

/** A picked bucket and prefix, or null for the default; an empty bucket means the default one. */
export function chosenStorage(
  choice: { bucket: string; prefix: string },
  groupId: string,
): { bucket: string; prefix: string } | null {
  const prefix = choice.prefix.trim()
  if (!choice.bucket && !prefix) return null
  return { bucket: choice.bucket || defaultStorageBucket(groupId), prefix }
}
