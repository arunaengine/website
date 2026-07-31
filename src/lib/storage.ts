// Presentation helpers for configurable storage: the per-kind config tables the
// dialogs render, and the plain-language wording the location and quota
// surfaces need. Kept out of the components so both can be unit tested.
import type {
  BackendStatus,
  BlobCopyState,
  GroupBackendKind,
  GroupBackendResponse,
  RoutingTarget,
} from './api'

export interface BackendField {
  key: string
  label: string
  required?: boolean
  placeholder?: string
}

export interface BackendKindSchema {
  label: string
  /** Keys naming the physical store; the backend refuses to change them. */
  identity: string[]
  public: BackendField[]
  secret: BackendField[]
  /** When set, exactly one of these secrets suffices; otherwise all are needed. */
  secretOneOf?: string[]
  /** Optional boolean public key, written as "true" or omitted. */
  toggle?: { key: string; label: string; hint: string }
}

// Mirrors the backend allowlists in aruna
// operations/src/group_backends/validation.rs (rules_for_kind, identity_keys).
// Keys outside these lists are rejected: the denylist alternative is
// unenforceable because opendal silently accepts a wide alias set.
export const BACKEND_KIND_SCHEMAS: Record<GroupBackendKind, BackendKindSchema> = {
  s3: {
    label: 'S3',
    identity: ['endpoint', 'bucket'],
    public: [
      { key: 'endpoint', label: 'Endpoint', required: true, placeholder: 'https://s3.example.org' },
      { key: 'bucket', label: 'Bucket', required: true, placeholder: 'my-bucket' },
      { key: 'region', label: 'Region', placeholder: 'eu-central-1' },
      { key: 'root', label: 'Root prefix', placeholder: 'aruna/' },
    ],
    secret: [
      { key: 'access_key_id', label: 'Access key ID', required: true },
      { key: 'secret_access_key', label: 'Secret access key', required: true },
    ],
    toggle: {
      key: 'force_path_style',
      label: 'Path-style addressing',
      hint: 'Needed by most self-hosted S3 implementations; AWS uses virtual-host style.',
    },
  },
  gcs: {
    label: 'Google Cloud Storage',
    identity: ['endpoint', 'bucket'],
    public: [
      { key: 'bucket', label: 'Bucket', required: true, placeholder: 'my-bucket' },
      { key: 'endpoint', label: 'Endpoint', placeholder: 'https://storage.googleapis.com' },
      { key: 'root', label: 'Root prefix', placeholder: 'aruna/' },
    ],
    secret: [{ key: 'credential', label: 'Service account credential (base64 JSON)', required: true }],
  },
  azblob: {
    label: 'Azure Blob Storage',
    identity: ['endpoint', 'container', 'account_name'],
    public: [
      { key: 'endpoint', label: 'Endpoint', required: true, placeholder: 'https://acct.blob.core.windows.net' },
      { key: 'container', label: 'Container', required: true, placeholder: 'my-container' },
      { key: 'account_name', label: 'Account name', required: true, placeholder: 'acct' },
      { key: 'root', label: 'Root prefix', placeholder: 'aruna/' },
    ],
    secret: [
      { key: 'account_key', label: 'Account key' },
      { key: 'sas_token', label: 'SAS token' },
    ],
    secretOneOf: ['account_key', 'sas_token'],
  },
  azdls: {
    label: 'Azure Data Lake Storage',
    identity: ['endpoint', 'filesystem', 'account_name'],
    public: [
      { key: 'endpoint', label: 'Endpoint', required: true, placeholder: 'https://acct.dfs.core.windows.net' },
      { key: 'filesystem', label: 'Filesystem', required: true, placeholder: 'my-filesystem' },
      { key: 'account_name', label: 'Account name', required: true, placeholder: 'acct' },
      { key: 'root', label: 'Root prefix', placeholder: 'aruna/' },
    ],
    secret: [
      { key: 'account_key', label: 'Account key' },
      { key: 'sas_token', label: 'SAS token' },
    ],
    secretOneOf: ['account_key', 'sas_token'],
  },
  b2: {
    label: 'Backblaze B2',
    identity: ['bucket', 'bucket_id'],
    public: [
      { key: 'bucket', label: 'Bucket', required: true, placeholder: 'my-bucket' },
      { key: 'bucket_id', label: 'Bucket ID', required: true, placeholder: '4a48fe8875c6214145260818' },
      { key: 'root', label: 'Root prefix', placeholder: 'aruna/' },
    ],
    secret: [
      { key: 'application_key_id', label: 'Application key ID', required: true },
      { key: 'application_key', label: 'Application key', required: true },
    ],
  },
}

export const BACKEND_KINDS = Object.keys(BACKEND_KIND_SCHEMAS) as GroupBackendKind[]

export function backendSchema(kind: string): BackendKindSchema | null {
  return BACKEND_KIND_SCHEMAS[kind as GroupBackendKind] ?? null
}

/** Where this storage points, from the fields that identify it. */
export function backendSummary(backend: GroupBackendResponse): string {
  const schema = backendSchema(backend.kind)
  const keys = schema ? schema.identity : Object.keys(backend.public_config)
  const parts = keys.map((key) => backend.public_config[key]).filter(Boolean)
  const root = backend.public_config.root
  if (root) parts.push(root)
  return parts.join(' · ')
}

/** Storage classes this node lets groups choose. */
export function tenantClasses(backends?: BackendStatus[]): string[] {
  const classes = new Set<string>()
  for (const backend of backends ?? []) {
    if (backend.allow_tenants && backend.class) classes.add(backend.class)
  }
  return [...classes].sort()
}

/** Human label for a target; a group's own storage resolves to its name. */
export function targetLabel(
  target: RoutingTarget | null | undefined,
  backends: GroupBackendResponse[] = [],
): string {
  if (!target) return "This node's own storage"
  if (target.backend_id) {
    const known = backends.find((backend) => backend.backend_id === target.backend_id)
    return known ? known.name : target.backend_id
  }
  if (target.class) return `Class ${target.class}`
  return "This node's own storage"
}

export interface BackendQuota {
  quotaBytes: number | null
  usedBytes: number | null
  /** True only when the node reports usage, which is what makes the limit real. */
  enforced: boolean
}

export function backendQuota(status: BackendStatus): BackendQuota {
  return {
    quotaBytes: status.quota_bytes ?? null,
    usedBytes: typeof status.used_bytes === 'number' ? status.used_bytes : null,
    enforced: typeof status.used_bytes === 'number',
  }
}

const COPY_STATES: Record<BlobCopyState, { label: string; description: string }> = {
  present: { label: 'stored', description: 'This node has the file.' },
  pending: {
    label: 'copying',
    description: 'A copy is on its way to this node; the file is not there yet.',
  },
  unreachable: {
    label: 'no answer',
    description: 'This node did not answer, so we cannot tell whether it has a copy.',
  },
  denied: {
    label: 'no access',
    description: 'This node keeps the bucket under rules you do not pass, so it would not say.',
  },
  'not-stored': {
    label: 'no data',
    description: 'This version holds no data anywhere: it marks a deletion or points at data elsewhere.',
  },
}

export function copyState(state: string): { label: string; description: string } {
  return COPY_STATES[state as BlobCopyState] ?? { label: state, description: '' }
}

const SCAN_LIMITS: Record<string, string> = {
  'queued-scan-truncated': 'The list of copies still being made was too long to read to the end.',
  'queued-scan-failed': 'The list of copies still being made could not be read.',
  'queued-record-unreadable': 'Some entries in that list could not be read and were skipped.',
  'candidate-cap-reached': 'More nodes could have a copy than one request asks; the rest were not contacted.',
  'holder-lookup-failed': 'The index of nodes that have this file could not be searched.',
  'holder-path-unknown': 'A node that has a copy could not be asked in a way it understood.',
}

export function scanLimitText(limit: string): string {
  return SCAN_LIMITS[limit] ?? `The search was limited: ${limit}.`
}
