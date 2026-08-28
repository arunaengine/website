// GET /metadata/search: verified against aruna api/src/routes/metadata.rs and
// operations/src/metadata/{api.rs,search_cursor.rs} (aruna feat/portal-backend).
// Contract: `q` is required and trimmed to >= 2 chars (shorter ⇒ 400); `limit`
// defaults to 25 and is clamped 1..=100; `mode=local|distributed`. `group_id`
// and `conforms_to` (exact conformsTo profile IRI) filter documents server-side.
// `cursor` is an accepted, query- and filter-bound opaque token: a cursor whose
// fingerprint does not match the query or filters is rejected with 400.
// Hits are ordered by descending score and deduplicated server-side per
// (graph_iri, subject_iri), so one document may span multiple hits. `title` is
// always served (schema:name with subject/path fallback); `snippet` is optional.
// Partiality is signalled by `nodes_failed` (not a `partial` flag); `truncated`
// marks a page that stopped at the server depth cap before exhausting matches.
export interface MetadataSearchHit {
  document_id: string
  group_id: string
  document_path: string
  graph_iri: string
  subject_iri: string
  score: number
  // Always served by the answering node (schema:name, then subject/path fallback).
  title: string
  // Query-relevant excerpt; absent when the resource has no indexed literals.
  snippet?: string | null
}

export interface MetadataSearchResponse {
  hits: MetadataSearchHit[]
  /** Node partitions queried. */
  nodes_queried: number
  /** Node partitions that failed or timed out; > 0 ⇒ partial. */
  nodes_failed: number
  /** True when paging stopped at the server depth cap before exhausting matches. */
  truncated?: boolean
  /** Query- and filter-bound cursor for the next page. */
  next_cursor?: string | null
}

export interface MetadataSearchOptions {
  limit?: number
  cursor?: string
  group_id?: string
  conforms_to?: string
  signal?: AbortSignal
}

// GET /search/buckets: federated bucket-name search (verified against aruna
// api/src/routes/search.rs on feat/portal_extensions). `q` is a case-insensitive
// bucket-name substring, trimmed to >= 2 chars (shorter ⇒ 400); `limit` defaults
// to 10 and is clamped 1..=50. Partiality is signalled via nodes_failed with the
// failing node ids listed in failed_nodes. Requires an authenticated session.
export interface BucketSearchHit {
  /** `arn:aruna:<realm>:<node>:s3/<bucket>`. Parse with parseArunaArn. */
  arn: string
  bucket: string
  node_id: string
  group_id: string
  group_name?: string | null
  created_at: string
}

export interface BucketSearchResponse {
  hits: BucketSearchHit[]
  nodes_queried: number
  nodes_failed: number
  failed_nodes: string[]
}

// GET /search/objects: authenticated live-head inventory search. The backend
// applies group READ and token path restrictions per hit and deliberately
// exposes no total. Distributed strict fails instead of returning a partial
// page; best-effort and local answers carry their exact coverage.
export type ObjectSearchMode = 'local' | 'distributed_best_effort' | 'distributed_strict'
export type ObjectSearchMatchMode = 'substring' | 'prefix'
export type ObjectSearchScope = 'this_node' | 'realm'

export interface ObjectSearchChecksum {
  algorithm: string
  value: string
}

export interface ObjectSearchHit {
  kind: 'object'
  mode: ObjectSearchMode
  issuer_node_id: string
  group_id: string
  bucket: string
  key: string
  content_w3id?: string | null
  checksum?: ObjectSearchChecksum | null
  size?: number | null
  updated_at?: string | null
}

export interface ObjectSearchIndexFreshness {
  source: string
  as_of: string
  oldest_observed_at?: string | null
}

export interface ObjectSearchPartitionCoverage {
  node_id: string
  observed_at: string
  truncated: boolean
}

export interface ObjectSearchCoverage {
  scope: ObjectSearchScope
  mode: ObjectSearchMode
  index_freshness: ObjectSearchIndexFreshness
  nodes_queried: number
  nodes_failed: number
  failed_partitions: string[]
  omitted_partitions: number
  complete: boolean
  truncated: boolean
  partitions: ObjectSearchPartitionCoverage[]
}

export interface ObjectSearchResponse {
  hits: ObjectSearchHit[]
  next_cursor?: string | null
  coverage: ObjectSearchCoverage
}

export interface ObjectSearchOptions {
  bucket?: string
  match?: ObjectSearchMatchMode
  mode?: ObjectSearchMode
  limit?: number
  cursor?: string
  signal?: AbortSignal
}

// GET /search: unified realm search (aruna api/src/routes/search.rs). Returns
// only the requested sections; `types` defaults to all four. `cursor` continues
// exactly one section and is rejected with 400 when more than one type is asked
// for (buckets never page; a buckets cursor is always 400). `limit` is
// per-section (default 10, clamped 1..=100). `group_id`, `conforms_to` and
// `mode` apply to the documents section only.
export type SearchSectionType = 'documents' | 'buckets' | 'groups' | 'users'

export interface UnifiedSearchOptions {
  types?: SearchSectionType[]
  limit?: number
  cursor?: string
  group_id?: string
  conforms_to?: string
  mode?: 'local' | 'distributed'
  signal?: AbortSignal
}

export interface SearchDocumentsSection {
  hits: MetadataSearchHit[]
  next_cursor?: string | null
  nodes_queried: number
  nodes_failed: number
  truncated: boolean
}

export interface SearchGroupHit {
  group_id: string
  display_name: string
}

export interface SearchGroupsSection {
  hits: SearchGroupHit[]
  next_cursor?: string | null
}

export interface SearchUserHit {
  user_id: string
  name: string
}

export interface SearchUsersSection {
  hits: SearchUserHit[]
  next_cursor?: string | null
}

export interface UnifiedSearchResponse {
  documents?: SearchDocumentsSection
  buckets?: BucketSearchResponse
  groups?: SearchGroupsSection
  users?: SearchUsersSection
}
