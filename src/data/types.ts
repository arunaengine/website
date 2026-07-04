import type { JsonSchema, ProfileEntityRule, ProfilePropertyRule } from '@/lib/profiles/types'

// -----------------------------------------------------------------------------
// Realms, nodes, and federation primitives
// -----------------------------------------------------------------------------

export interface Realm {
  id: string
  name: string
  shortName: string
  color: string
  description: string
  established: string
  homeCountry: string
  sharedQuotaBytes: number
  contact: string
}

export interface Node {
  id: string
  name: string
  slug: string
  realmId: string
  region: string
  country: string
  lat: number
  lng: number
  endpoint: string
  status: 'healthy' | 'degraded' | 'offline' | 'syncing'
  version: string
  storageUsedBytes: number
  storageQuotaBytes: number
  objectCount: number
  bucketCount: number
  metadataCount: number
  peers: string[]
  replicaFactor: number
  established: string
}

// -----------------------------------------------------------------------------
// Users and groups (permission principals inside a realm)
// -----------------------------------------------------------------------------

export type GroupRole = 'admin' | 'user' | 'viewer' | 'auditor'
export type RealmRole = 'realm-admin' | 'realm-operator' | 'realm-member' | 'realm-guest'

export interface User {
  id: string
  name: string
  email: string
  orcid?: string
  affiliation: string
  title?: string
  avatarColor: string
  initials: string
  preferredProfileId?: string
  favouriteMetadataIds?: string[]
}

export interface Group {
  id: string
  realmId: string
  name: string
  slug: string
  description: string
  createdAt: string
  quotaBytes: number
  usedBytes: number
  ownerId: string
  tags: string[]
  // Undefined when the member list is hidden from the caller.
  memberCount?: number
}

export interface GroupMembership {
  userId: string
  groupId: string
  role: GroupRole
  since: string
}

export interface RealmMembership {
  userId: string
  realmId: string
  role: RealmRole
  since: string
}

export type BucketAccess = 'admin' | 'read-write' | 'read-only'

export interface BucketPermission {
  bucketId: string
  principalId: string
  principalKind: 'group' | 'user'
  access: BucketAccess
  grantedBy: string
  grantedAt: string
}

export interface Invitation {
  id: string
  realmId: string
  groupId?: string
  email: string
  role: GroupRole | RealmRole
  status: 'pending' | 'accepted' | 'revoked'
  invitedBy: string
  invitedAt: string
}

export interface AccessToken {
  id: string
  name: string
  scopes: string[]
  createdAt: string
  lastUsedAt?: string
  revoked: boolean
  preview: string
  realmId: string
}

// -----------------------------------------------------------------------------
// Buckets and objects
// -----------------------------------------------------------------------------

export type BucketKind = 'local' | 'virtual' | 'staging' | 'replica'

export interface Bucket {
  id: string
  name: string
  displayName: string
  kind: BucketKind
  nodeId: string
  realmId: string
  ownerGroupId: string
  description: string
  sizeBytes: number
  objectCount: number
  replicas: number
  replicaNodes: string[]
  tags: string[]
  createdAt: string
  updatedAt: string
  virtualSources?: { bucketId: string; cached: boolean }[]
  syncState?: 'in-sync' | 'syncing' | 'drift' | 'paused'
  visibility: 'public' | 'internal' | 'private'
}

export type ObjectKind = 'file' | 'folder' | 'reference' | 'cached'

export interface S3Object {
  id: string
  bucketId: string
  key: string
  name: string
  kind: ObjectKind
  parent: string
  sizeBytes: number
  mime: string
  blake3?: string
  createdAt: string
  updatedAt: string
  replicas: string[]
  sourceNode?: string
  sourceBlake3?: string
  metadataId?: string
  cacheState?: 'cached' | 'remote' | 'pinned' | 'staging'
  tags?: string[]
}

// -----------------------------------------------------------------------------
// Metadata (RO-Crate)
// -----------------------------------------------------------------------------

export interface MetadataVersion {
  version: number
  versionVector: string
  createdAt: string
  author: string
  changelog: string
  hash: string
}

export interface MetadataProfile {
  id: string
  documentId?: string
  documentPath?: string
  graphIri?: string
  profileUri?: string
  name: string
  shortName: string
  description: string
  domain: string
  version?: string
  iconColor: string
  // Structured RO-Crate entity rules parsed from the profile crate.
  entityRules: ProfileEntityRule[]
  // Property rules on the root Dataset entity, kept for quick display/fallback.
  propertyRules: ProfilePropertyRule[]
  schema?: JsonSchema
  // Suggested keywords / vocabularies that are pre-populated when this profile is used
  suggestedKeywords: string[]
  // Whether this profile is editable by the current user (some are realm-managed templates)
  managed: boolean
  // Derived count used for sorting/popularity.
  usedCount: number
}

export interface MetadataContributor {
  name: string
  role: string
  orcid?: string
  affiliation?: string
}

export interface MetadataDoc {
  ulid: string
  title: string
  description: string
  type: string
  license: string
  keywords: string[]
  currentVersion: number
  versions: MetadataVersion[]
  linkedObjects: string[]
  primaryBucketId: string
  realmId: string
  createdAt: string
  updatedAt: string
  author: string
  organization: string
  nodeId: string
  profileId: string
  profileIds?: string[]
  contributors: MetadataContributor[]
  // Optional richer fields commonly present in research RO-Crates
  doi?: string
  citation?: string
  funding?: string
  temporalCoverage?: string
  spatialCoverage?: string
  language?: string
  relatedWorks?: { title: string; doi?: string; url?: string }[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  roCrate: any
}

// -----------------------------------------------------------------------------
// Activity and query
// -----------------------------------------------------------------------------

export interface ActivityEvent {
  id: string
  kind:
    | 'replication.started'
    | 'replication.completed'
    | 'metadata.published'
    | 'metadata.updated'
    | 'object.uploaded'
    | 'bucket.created'
    | 'sparql.query'
    | 'sync.drift'
    | 'stage.pinned'
    | 'group.created'
    | 'group.member.added'
    | 'permission.granted'
    | 'invitation.sent'
  at: string
  actor: string
  realmId?: string
  nodeId?: string
  bucketId?: string
  groupId?: string
  metadataUlid?: string
  blake3?: string
  message: string
}

export interface SparqlResult {
  columns: string[]
  rows: Record<string, string>[]
  tookMs: number
  totalRows: number
}

export interface SavedQuery {
  id: string
  realmId: string
  name: string
  description: string
  sparql: string
  savedBy: string
  savedAt: string
  tags: string[]
}
