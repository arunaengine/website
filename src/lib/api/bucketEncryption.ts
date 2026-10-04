// Bucket encryption routes. Every request goes to the API base of the node that
// hosts the bucket, never through S3. An older node answers 404: "not reported
// here", never "off".
import { ApiError, apiRequest, type ApiClientOptions } from './client'

export type EncryptionMode = 'off' | 'node_managed' | 'vault_locked'
export type BlockCipher = 'chacha20_poly1305' | 'aes256_gcm'
export type BlockKeys = 'content_derived' | 'unique'
/** Why a bucket is locked: a holder locked it, its timed unlock ended, or the node restarted. */
export type LockReason = 'manual' | 'timed' | 'restart'

export interface BucketUnlockStatus {
  state: 'locked' | 'unlocked'
  /** Null while unlocked, and for a bucket that has not been locked since it was created. */
  lock_reason: LockReason | null
  locked_at_ms: number | null
  /** The unlock session an extension must name; null while locked. */
  session_id: string | null
  unlocked_at_ms: number | null
  /** End of a timed unlock; null means until lock or restart. */
  deadline_ms: number | null
  /** The latest end an extension may reach, from the bucket maximum; null without one. */
  max_deadline_ms: number | null
}

/** Distinct users per holder state for the active key generation. Null counts are unknown. */
export interface HolderReadiness {
  ready: number | null
  pending: number | null
  /** Holders whose user key the directory lacks or did not return. */
  missing_key: number | null
}

// `met`: two ready holders, or one whose directory record declares a recovery code.
// `unknown`: the key directory did not answer, so the rule could not be checked.
export interface RecoveryStatus {
  state: 'met' | 'degraded' | 'unknown'
  ready_holders: number | null
  ready_with_recovery: number | null
}

export type TransitionKind = 'encrypt' | 'decrypt' | 'reencode' | 'rotate'
export type TransitionState = 'running' | 'awaiting_key' | 'cleanup' | 'blocked' | 'finished'

/** This node's rewrite of stored versions after a mode change, a format change or a rotation. */
export interface EncryptionTransition {
  kind: TransitionKind
  state: TransitionState
  source_generation: number | null
  target_generation: number | null
  /** Versions already written in the target form. */
  done: number
  /** Versions still to rewrite; null while the node has not counted them. */
  remaining: number | null
  failed: number
  /** Old copies still to remove; the change is complete only when this reaches zero. */
  cleanup_remaining: number | null
  started_at_ms: number
  finished_at_ms: number | null
  /** Why the work cannot go on, such as a backend that keeps old copies. */
  blocked_reason: string | null
}

/** What the caller may do on this bucket. */
export interface EncryptionCaller {
  /** Current key holder: creator, group admin or explicit grant. */
  holder: boolean
  /** Has a ready sealed copy of the active generation. */
  ready_copy: boolean
  /** Group-admin WRITE: settings, holders and rotation. */
  admin: boolean
}

export type KeyRole = 'active' | 'source'

/** A key generation the node still needs: the active one, or the source of a running change. */
export interface BucketKeyGeneration {
  generation: number
  role: KeyRole
  /** Standard base64 of the 32-byte X25519 public key. */
  public_key: string
  /** Lowercase hex SHA-256 of the public key. */
  fingerprint: string
  unlock: BucketUnlockStatus
}

export interface BucketEncryptionResponse {
  bucket: string
  mode: EncryptionMode
  /** Stable id the bucket keys bind to; null until encryption was first enabled. */
  bucket_id: string | null
  storage_generation: number
  /** Generation new writes seal to; zero until the first key exists. */
  key_generation: number
  /** Standard base64 of the 32-byte X25519 public key of the active generation. */
  public_key: string | null
  /** Lowercase hex SHA-256 of the public key. */
  fingerprint: string | null
  cipher: BlockCipher
  block_keys: BlockKeys
  /** Longest unlock a holder may ask for; null means until lock or restart. */
  max_unlock_ms: number | null
  /** The active generation's unlock state; null while encryption is off. */
  unlock: BucketUnlockStatus | null
  /** Every generation the node still needs, also while mode is off; absent on an older node. */
  generations?: BucketKeyGeneration[]
  holders: HolderReadiness | null
  recovery: RecoveryStatus | null
  transition: EncryptionTransition | null
  caller: EncryptionCaller
}

export interface PutBucketEncryptionRequest {
  mode: EncryptionMode
  cipher?: BlockCipher
  block_keys?: BlockKeys
  /** Null removes the maximum; absent keeps it. */
  max_unlock_ms?: number | null
  /** The key generation the caller saw; another current one is a 409 `stale_generation`. */
  expected_generation: number
}

/** The non-secret unlock fields. The 32 key bytes travel as the binary body. */
export interface UnlockBucketRequest {
  bucket_id: string
  generation: number
  /** Absent means the bucket maximum, or until lock or restart without one. */
  duration_ms?: number
}

export interface ExtendUnlockRequest {
  session_id: string
  /** Measured from now; absent means the bucket maximum, or until lock or restart. */
  duration_ms?: number
}

export type HolderOrigin = 'creator' | 'admin' | 'explicit'
/** `missing_key`: no usable user key in the directory. `unavailable`: the directory did not answer. */
export type HolderState = 'ready' | 'pending' | 'missing_key' | 'unavailable'

export interface BucketHolderEntry {
  user_id: string
  name?: string | null
  origin: HolderOrigin
  state: HolderState
  /** From the user's key directory record; null when unknown. */
  has_recovery: boolean | null
  granted_by: string | null
  granted_at_ms: number | null
}

export interface BucketHoldersResponse {
  holders: BucketHolderEntry[]
  recovery: RecoveryStatus
  /** Opaque revision of the holder set; a removal names it so a changed set is refused. */
  revision: string
}

/** A bucket private key sealed with HPKE to one of the caller's user keys. */
export interface SealedCopyEntry {
  bucket_id: string
  generation: number
  /** The key directory record the copy is sealed to. */
  key_record: string
  /** The vault keypair id of that record. */
  key_id: string
  /** Standard base64 of the 32-byte encapsulated key. */
  enc: string
  /** Standard base64 of the AES-256-GCM ciphertext. */
  ciphertext: string
  created_at_ms: number
}

export interface SealedCopiesResponse {
  copies: SealedCopyEntry[]
}

export interface BucketAuditEvent {
  event_id: string
  at_ms: number
  /** unlock, extend, lock, timed_lock, restart_lock, mode_change, holder_grant, holder_remove, rotate. */
  action: string
  /** Null for the node itself, such as a timed or restart lock. */
  actor_user_id: string | null
  node_id: string
  generation: number | null
  deadline_ms: number | null
  reason: string | null
  /** applied, intent (no outcome recorded) or failed. */
  outcome: string
}

export interface BucketAuditResponse {
  events: BucketAuditEvent[]
  /** Opaque; omitted on the last page. */
  next_cursor?: string
}

export const BUCKET_KEY_BYTES = 32

/** Machine-readable codes of the encryption routes. */
export const ENCRYPTION_CODES = {
  locked: 'bucket_locked',
  wrongKey: 'wrong_key',
  invalidDuration: 'invalid_duration',
  staleGeneration: 'stale_generation',
  openUploads: 'open_uploads',
  sessionMismatch: 'session_mismatch',
  staleHolders: 'stale_holders',
  confirmRecovery: 'recovery_confirmation_required',
  recoveryUnmet: 'recovery_unmet',
  capacity: 'unlock_capacity',
} as const

function base(bucket: string): string {
  return `/data/buckets/${encodeURIComponent(bucket)}/storage/encryption`
}

/** True when the node refused because the bucket is locked. */
export function bucketLocked(error: unknown): boolean {
  return encryptionRefusal(error, 409, ENCRYPTION_CODES.locked)
}

export function encryptionRefusal(error: unknown, status: number, code: string): boolean {
  return error instanceof ApiError && error.status === status && error.code === code
}

export function getBucketEncryption(
  bucket: string,
  client: ApiClientOptions,
  signal?: AbortSignal,
): Promise<BucketEncryptionResponse> {
  return apiRequest(base(bucket), { signal }, client)
}

export function putBucketEncryption(
  bucket: string,
  request: PutBucketEncryptionRequest,
  client: ApiClientOptions,
): Promise<BucketEncryptionResponse> {
  return apiRequest(base(bucket), { method: 'PUT', body: JSON.stringify(request) }, client)
}

/** Sends exactly the 32 key bytes as the body; the caller clears its buffer afterwards. */
export function unlockBucket(
  bucket: string,
  request: UnlockBucketRequest,
  key: Uint8Array<ArrayBuffer>,
  client: ApiClientOptions,
): Promise<BucketUnlockStatus> {
  if (key.length !== BUCKET_KEY_BYTES) {
    return Promise.reject(new Error('A bucket key has exactly 32 bytes.'))
  }
  return apiRequest(
    `${base(bucket)}/unlock`,
    {
      method: 'POST',
      body: key,
      headers: { 'Content-Type': 'application/octet-stream' },
      query: { ...request },
    },
    client,
  )
}

export function extendUnlock(
  bucket: string,
  request: ExtendUnlockRequest,
  client: ApiClientOptions,
): Promise<BucketUnlockStatus> {
  return apiRequest(`${base(bucket)}/extend`, { method: 'POST', body: JSON.stringify(request) }, client)
}

export function lockBucket(bucket: string, client: ApiClientOptions): Promise<BucketUnlockStatus> {
  return apiRequest(`${base(bucket)}/lock`, { method: 'POST' }, client)
}

export function listBucketHolders(
  bucket: string,
  client: ApiClientOptions,
  signal?: AbortSignal,
): Promise<BucketHoldersResponse> {
  return apiRequest(`${base(bucket)}/holders`, { signal }, client)
}

export function grantBucketHolder(
  bucket: string,
  userId: string,
  client: ApiClientOptions,
): Promise<BucketHolderEntry> {
  return apiRequest(`${base(bucket)}/holders`, { method: 'POST', body: JSON.stringify({ user_id: userId }) }, client)
}

/** `confirmRecovery` accepts that the removal breaks the recovery rule. */
export function removeBucketHolder(
  bucket: string,
  userId: string,
  revision: string,
  confirmRecovery: boolean,
  client: ApiClientOptions,
): Promise<void> {
  return apiRequest(
    `${base(bucket)}/holders/${encodeURIComponent(userId)}`,
    { method: 'DELETE', query: { revision, confirm_recovery: confirmRecovery || undefined } },
    client,
  )
}

export function getMyCopies(
  bucket: string,
  generation: number,
  client: ApiClientOptions,
  signal?: AbortSignal,
): Promise<SealedCopiesResponse> {
  return apiRequest(`${base(bucket)}/copies/me`, { signal, query: { generation } }, client)
}

export function rotateBucketKey(
  bucket: string,
  expectedGeneration: number,
  client: ApiClientOptions,
): Promise<BucketEncryptionResponse> {
  return apiRequest(
    `${base(bucket)}/rotate`,
    { method: 'POST', body: JSON.stringify({ expected_generation: expectedGeneration }) },
    client,
  )
}

export function getBucketAudit(
  bucket: string,
  client: ApiClientOptions,
  page: { limit?: number; cursor?: string } = {},
  signal?: AbortSignal,
): Promise<BucketAuditResponse> {
  return apiRequest(`${base(bucket)}/audit`, { signal, query: { ...page } }, client)
}
