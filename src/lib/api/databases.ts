// ── Bucket metadata, releases and identifier rules ──────────────────────────
// Verified against aruna api/src/routes/storage/bucket_metadata.rs, storage/releases.rs and
// identifiers.rs (feat/run-provenance-gaps). A database is any bucket whose metadata says
// `database: true`; `/search/buckets?database=true` finds them. Each call goes to the bucket's node.
import { apiRequest, type ApiClientOptions } from './client'

/** One identifier of a bucket or release, such as its DOI. */
export interface BucketIdentifier {
  name: string
  value: string
  url: string
}

/** One identifier rule: a Rust regex with a group named `id`, and a link with `{id}`. */
export interface IdentifierRule {
  name: string
  pattern: string
  target: 'key' | 'source_url'
  url_template: string
}

export interface IdentifierParser {
  rules: IdentifierRule[]
}

export interface FoundIdentifier {
  name: string
  value: string
  url: string
  target: 'key' | 'source_url'
}

/** What describes a bucket; `database` lets the portal show it as a database. */
export interface BucketMetadata {
  database: boolean
  title?: string | null
  description?: string | null
  version?: string | null
  /** A license URL or SPDX id. */
  license?: string | null
  identifiers: BucketIdentifier[]
  parser?: IdentifierParser | null
  /** The dataset document that describes the bucket. */
  dataset?: string | null
}

const bucketPath = (bucket: string, rest: string) => `/data/buckets/${encodeURIComponent(bucket)}/${rest}`

/** The bucket's metadata; `null` when it has none. */
export async function getBucketMetadata(bucket: string, client: ApiClientOptions = {}, signal?: AbortSignal): Promise<BucketMetadata | null> {
  const answer = await apiRequest<{ metadata?: BucketMetadata | null }>(bucketPath(bucket, 'metadata'), { signal }, client)
  return answer.metadata ?? null
}

/** Replaces the bucket's metadata, or clears it with `null`. Needs admin rights on the owning group. */
export async function putBucketMetadata(bucket: string, metadata: BucketMetadata | null, client: ApiClientOptions = {}): Promise<BucketMetadata | null> {
  const body = JSON.stringify({ metadata })
  const answer = await apiRequest<{ metadata?: BucketMetadata | null }>(bucketPath(bucket, 'metadata'), { method: 'PUT', body }, client)
  return answer.metadata ?? null
}

/** A release: the exact version of its tagged release file. */
export interface ReleaseItem {
  key: string
  version_id: string
  label: string
  /** The folder whose files it pins; empty for the whole bucket. */
  prefix: string
}

export interface ReleaseListResponse {
  bucket: string
  releases: ReleaseItem[]
  /** False when this node does not hold every range, so releases may be missing. */
  complete: boolean
}

export interface PublishReleaseRequest {
  key: string
  label: string
  prefix: string
  upstream: BucketIdentifier[]
  preparation: string[]
}

export interface PublishReleaseResponse {
  bucket: string
  key: string
  version_id: string
  files: number
  /** An identical release was already the key's current version. */
  replayed: boolean
}

export function listReleases(bucket: string, client: ApiClientOptions = {}, signal?: AbortSignal): Promise<ReleaseListResponse> {
  return apiRequest(bucketPath(bucket, 'releases'), { signal }, client)
}

/**
 * The preparation runs a release names, read from its crate on the bucket's node: the run ids of
 * the CreateActions the crate's root mentions. Empty when the release names none.
 */
export async function releasePreparation(objectId: string, client: ApiClientOptions, signal?: AbortSignal): Promise<string[]> {
  const crate = await apiRequest<{ '@graph'?: unknown }>('/ga4gh/drs/v1/download', { query: { object_id: objectId, here: true }, signal }, client)
  const graph = Array.isArray(crate?.['@graph']) ? (crate['@graph'] as Record<string, unknown>[]) : []
  const idOf = (value: unknown) => (value && typeof value === 'object' ? (value as { '@id'?: unknown })['@id'] : value)
  const root = graph.find((entity) => entity['@id'] === './')
  const mentioned = new Set([root?.mentions ?? []].flat().map(idOf))
  return graph
    .filter((entity) => mentioned.has(entity['@id']) && entity['@type'] === 'CreateAction' && typeof entity.identifier === 'string')
    .map((entity) => entity.identifier as string)
}

export function publishRelease(bucket: string, body: PublishReleaseRequest, client: ApiClientOptions = {}): Promise<PublishReleaseResponse> {
  return apiRequest(bucketPath(bucket, 'releases'), { method: 'POST', body: JSON.stringify(body) }, client)
}

/** Tries identifier rules on a sample key or source URL with the server's regex engine; stores nothing. */
export async function testIdentifierRules(
  body: { parser: IdentifierParser; key: string; source_url?: string | null },
  client: ApiClientOptions = {},
): Promise<FoundIdentifier[]> {
  const answer = await apiRequest<{ identifiers: FoundIdentifier[] }>('/data/identifier-rules/test', { method: 'POST', body: JSON.stringify(body) }, client)
  return answer.identifiers
}
