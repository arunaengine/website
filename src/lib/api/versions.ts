import { apiRequest, type ApiClientOptions } from './client'

// Dataset versions: the plain JSON view of a metadata document's ARC Git
// history (aruna api/src/routes/git/versions.rs and branches.rs).

export interface VersionAuthor {
  name: string
  email: string
  /** Set only for versions the node made itself; resolve it to a display name. */
  user_id?: string | null
}

export interface DatasetVersion {
  version: string
  parents: string[]
  created_at: string
  author: VersionAuthor
  message: string
  /** The commit carries a signature; the node does not verify it. */
  signed: boolean
  metadata_event_id?: string | null
  branches: string[]
  tags: string[]
}

export interface VersionPage {
  versions: DatasetVersion[]
  next_cursor?: string | null
}

export type FileChangeKind = 'added' | 'modified' | 'deleted'

export interface FileChange {
  path: string
  change: FileChangeKind
}

export interface PropertyChange {
  name: string
  before: unknown[]
  after: unknown[]
}

export interface EntityChange {
  id: string
  label?: string | null
  change: 'added' | 'removed' | 'changed'
  properties: PropertyChange[]
}

export interface VersionComparison {
  from?: string | null
  to: string
  /** Null when either side has no readable ISA metadata. */
  entities: EntityChange[] | null
  files: FileChange[]
}

export interface DatasetBranch {
  name: string
  version: string
  protected: boolean
  head: DatasetVersion
}

export interface DatasetTag {
  name: string
  version: string
}

export interface VersionConflict {
  id: string
  branch?: string | null
  tag?: string | null
  version: DatasetVersion
}

export interface MergeResult {
  version: string
  fast_forward: boolean
}

/** 409 body of a merge that both sides changed differently. */
export interface MergeConflictBody {
  files: string[]
  properties: Array<{ entity: string; property: string; source: unknown[]; target: unknown[] }>
}

function metadataPath(documentId: string, rest: string): string {
  return `/metadata/${encodeURIComponent(documentId)}/${rest}`
}

function ifMatch(head?: string): HeadersInit | undefined {
  return head ? { 'If-Match': `"${head}"` } : undefined
}

export interface VersionQuery {
  branch: string
  since?: string
  cursor?: string
  limit?: number
}

export function listVersions(documentId: string, query: VersionQuery, client: ApiClientOptions): Promise<VersionPage> {
  return apiRequest(metadataPath(documentId, 'versions'), { query: { ...query } }, client)
}

export function versionCrate(
  documentId: string,
  version: string,
  client: ApiClientOptions,
): Promise<{ commit: string; rocrate: unknown }> {
  return apiRequest(metadataPath(documentId, `versions/${encodeURIComponent(version)}/rocrate`), {}, client)
}

export function compareVersions(
  documentId: string,
  to: string,
  from: string | undefined,
  client: ApiClientOptions,
): Promise<VersionComparison> {
  return apiRequest(metadataPath(documentId, 'compare'), { query: { from, to } }, client)
}

export async function listBranches(documentId: string, client: ApiClientOptions): Promise<DatasetBranch[]> {
  const body = await apiRequest<{ branches: DatasetBranch[] }>(metadataPath(documentId, 'branches'), {}, client)
  return body?.branches ?? []
}

export function createBranch(
  documentId: string,
  input: { name: string; from: string },
  client: ApiClientOptions,
): Promise<DatasetTag> {
  return apiRequest(metadataPath(documentId, 'branches'), { method: 'POST', body: JSON.stringify(input) }, client)
}

export function deleteBranch(documentId: string, name: string, head: string, client: ApiClientOptions): Promise<void> {
  return apiRequest(
    metadataPath(documentId, `branches/${encodeURIComponent(name)}`),
    { method: 'DELETE', headers: ifMatch(head) },
    client,
  )
}

export function mergeBranch(
  documentId: string,
  name: string,
  input: { into: string; message?: string },
  head: string | undefined,
  client: ApiClientOptions,
): Promise<MergeResult> {
  return apiRequest(
    metadataPath(documentId, `branches/${encodeURIComponent(name)}/merge`),
    { method: 'POST', body: JSON.stringify(input), headers: ifMatch(head) },
    client,
  )
}

export async function listTags(documentId: string, client: ApiClientOptions): Promise<DatasetTag[]> {
  const body = await apiRequest<{ tags: DatasetTag[] }>(metadataPath(documentId, 'tags'), {}, client)
  return body?.tags ?? []
}

export function createTag(
  documentId: string,
  input: { name: string; version: string },
  client: ApiClientOptions,
): Promise<DatasetTag> {
  return apiRequest(metadataPath(documentId, 'tags'), { method: 'POST', body: JSON.stringify(input) }, client)
}

export function deleteTag(documentId: string, tag: DatasetTag, client: ApiClientOptions): Promise<void> {
  return apiRequest(
    metadataPath(documentId, `tags/${encodeURIComponent(tag.name)}`),
    { method: 'DELETE', headers: ifMatch(tag.version) },
    client,
  )
}

export async function listConflicts(documentId: string, client: ApiClientOptions): Promise<VersionConflict[]> {
  const body = await apiRequest<{ conflicts: VersionConflict[] }>(metadataPath(documentId, 'conflicts'), {}, client)
  return body?.conflicts ?? []
}

export function mergeConflict(
  documentId: string,
  id: string,
  head: string | undefined,
  client: ApiClientOptions,
): Promise<MergeResult> {
  return apiRequest(
    metadataPath(documentId, `conflicts/${encodeURIComponent(id)}/merge`),
    { method: 'POST', headers: ifMatch(head) },
    client,
  )
}

export function discardConflict(documentId: string, id: string, client: ApiClientOptions): Promise<void> {
  return apiRequest(metadataPath(documentId, `conflicts/${encodeURIComponent(id)}`), { method: 'DELETE' }, client)
}

// GET /metadata/{id}/git: the dataset's Git repository (snapshot.rs RepositoryStatus).
export interface GitRepository {
  document_id: string
  clone_url: string
  lfs_url: string
  bucket: string
  revision?: string | null
  /** Head of the protected aruna branch. */
  commit?: string | null
  /** The last conversion failed and no newer snapshot replaced it. */
  error?: string | null
  refs: Record<string, string>
}

export function getGitRepository(documentId: string, client: ApiClientOptions): Promise<GitRepository> {
  return apiRequest(metadataPath(documentId, 'git'), {}, client)
}
