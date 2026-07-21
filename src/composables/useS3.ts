import { computed, ref, watch } from 'vue'
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListBucketsCommand,
  ListObjectVersionsCommand,
  ListObjectsV2Command,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { parseS3Url } from '@/lib/tes'
import { useAruna } from './useAruna'

export interface S3Key {
  accessKeyId: string
  secretAccessKey: string
}

export interface BucketEntry {
  name: string
  createdAt?: Date
}

export interface ObjectEntry {
  key: string
  name: string
  size?: number
  lastModified?: Date
  etag?: string
}

export interface FolderEntry {
  prefix: string
  name: string
}

export interface ObjectPage {
  objects: ObjectEntry[]
  folders: FolderEntry[]
  nextToken?: string
}

export interface ObjectHead {
  size?: number
  contentType?: string
  etag?: string
  lastModified?: Date
  /** User metadata; the SDK strips the x-amz-meta- prefix from the keys. */
  metadata: Record<string, string>
}

const { nodeInfo, realmInfo, authToken, apiBaseUrl, currentUser } = useAruna()

const STORAGE_KEY = 'aruna.s3Key'

// The persisted key is scoped to the connection and account it was activated
// under so a stored secret is never reused against a different API or user.
interface StoredS3Key extends S3Key {
  userId?: string
  apiBase?: string
}

function loadStoredKey(): StoredS3Key | null {
  try {
    // Keys persist across restarts, same trust level as aruna.authToken.
    // Fall back to sessionStorage once to migrate older portal versions.
    const raw = localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredS3Key>
    if (typeof parsed.accessKeyId !== 'string' || typeof parsed.secretAccessKey !== 'string') return null
    if (typeof parsed.apiBase === 'string' && parsed.apiBase !== apiBaseUrl.value) return null
    return {
      accessKeyId: parsed.accessKeyId,
      secretAccessKey: parsed.secretAccessKey,
      userId: typeof parsed.userId === 'string' ? parsed.userId : undefined,
      apiBase: typeof parsed.apiBase === 'string' ? parsed.apiBase : undefined,
    }
  } catch {
    // fall through to no key
  }
  return null
}

const activeKey = ref<StoredS3Key | null>(loadStoredKey())

const endpoint = computed(
  () =>
    nodeInfo.value?.services?.interfaces?.s3?.url ??
    realmInfo.value?.interfaces?.s3?.url ??
    null,
)

const hasActiveKey = computed(() => activeKey.value !== null)

// S3 credentials are realm-wide: a key issued on one node authenticates on
// every node, so remote buckets are browsed with the same stored key against
// the remote node's published S3 endpoint. One client per endpoint, all
// invalidated together when the active key changes.
const clientCache = new Map<string, { key: S3Key; client: S3Client }>()

// Resolves the S3 endpoint serving `nodeId`; null/the local peer id map to
// the connected node's endpoint. Returns null when the node publishes none.
function endpointForNode(nodeId?: string | null): string | null {
  if (!nodeId || nodeId === nodeInfo.value?.node.peer_id) return endpoint.value
  const node = (realmInfo.value?.nodes ?? []).find((entry) => entry.node_id === nodeId)
  return node?.info?.urls?.s3 ?? null
}

// Maps a path-style object URL (as stored in profile-crate `contentUrl`s) back to
// the bucket/key/node an authenticated GetObject needs. Tries the connected
// node's endpoint first, then every realm node's published S3 endpoint, so a
// crate published on a remote node still resolves. Returns null for hosts that
// belong to no known node, the genuinely external URLs a browser must fetch
// directly.
function resolveObjectUrl(url: string): { bucket: string; key: string; nodeId: string | null } | null {
  const local = parseS3Url(url, endpoint.value)
  if (local) return { ...local, nodeId: null }
  for (const node of realmInfo.value?.nodes ?? []) {
    const nodeEndpoint = node.info?.urls?.s3
    if (!nodeEndpoint) continue
    const parsed = parseS3Url(url, nodeEndpoint)
    if (parsed) return { ...parsed, nodeId: node.node_id }
  }
  return null
}

function client(nodeId?: string | null): S3Client {
  const url = endpointForNode(nodeId)
  const key = activeKey.value
  if (!url) {
    throw new Error(
      nodeId && nodeId !== nodeInfo.value?.node.peer_id
        ? 'This node does not publish an S3 endpoint'
        : 'The node does not advertise an S3 endpoint',
    )
  }
  if (!key) throw new Error('No active S3 credentials')
  const cached = clientCache.get(url)
  if (cached && cached.key === key) return cached.client
  const created = new S3Client({
    endpoint: url,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: key.accessKeyId, secretAccessKey: key.secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
  clientCache.set(url, { key, client: created })
  return created
}

function setActiveKey(key: S3Key) {
  const stored: StoredS3Key = {
    accessKeyId: key.accessKeyId,
    secretAccessKey: key.secretAccessKey,
    userId: currentUser.value?.id,
    apiBase: apiBaseUrl.value,
  }
  activeKey.value = stored
  clientCache.clear()
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Keep the key in memory when storage is unavailable.
  }
}

function clearActiveKey() {
  activeKey.value = null
  clientCache.clear()
  try {
    sessionStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // The in-memory key is already cleared.
  }
}

// The persisted secret survives re-logins on this device; only an explicit
// sign-out (token cleared) or an API switch revokes browser-side access.
watch([authToken, apiBaseUrl], ([token, base], [previousToken, previousBase]) => {
  if (base !== previousBase) clearActiveKey()
  else if (!token && previousToken) clearActiveKey()
})

// A key activated by one account must never survive into another account's
// session; stamp legacy entries that predate the userId scope.
watch(currentUser, (user) => {
  const key = activeKey.value
  if (!user || !key) return
  if (key.userId && key.userId !== user.id) clearActiveKey()
  else if (!key.userId) setActiveKey(key)
})

async function listBuckets(): Promise<BucketEntry[]> {
  const response = await client().send(new ListBucketsCommand({}))
  return (response.Buckets ?? [])
    .filter((bucket) => bucket.Name)
    .map((bucket) => ({ name: bucket.Name as string, createdAt: bucket.CreationDate }))
}

async function createBucket(name: string): Promise<void> {
  await client().send(new CreateBucketCommand({ Bucket: name }))
}

// Read-only CORS for publicly served artifacts: browsers (other portals,
// Crate-O, …) must be able to fetch objects from this bucket cross-origin.
async function allowPublicReadCors(bucket: string): Promise<void> {
  await client().send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedMethods: ['GET', 'HEAD'],
            AllowedOrigins: ['*'],
            AllowedHeaders: ['*'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  )
}

// Small generated artifacts (profile mode/schema/html) — a single PutObject,
// no multipart machinery.
async function putTextObject(bucket: string, key: string, text: string, contentType: string): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: new TextEncoder().encode(text),
      ContentType: contentType,
    }),
  )
}

async function listObjects(
  bucket: string,
  prefix: string,
  token?: string,
  nodeId?: string | null,
): Promise<ObjectPage> {
  const response = await client(nodeId).send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix || undefined,
      Delimiter: '/',
      ContinuationToken: token,
      MaxKeys: 200,
    }),
  )
  const folders = (response.CommonPrefixes ?? [])
    .filter((entry) => entry.Prefix)
    .map((entry) => {
      const full = entry.Prefix as string
      return { prefix: full, name: full.slice(prefix.length).replace(/\/$/, '') }
    })
  const objects = (response.Contents ?? [])
    .filter((entry) => entry.Key && entry.Key !== prefix)
    .map((entry) => ({
      key: entry.Key as string,
      name: (entry.Key as string).slice(prefix.length),
      size: entry.Size,
      lastModified: entry.LastModified,
      etag: entry.ETag?.replaceAll('"', ''),
    }))
  return {
    objects,
    folders,
    nextToken: response.IsTruncated ? response.NextContinuationToken : undefined,
  }
}

// Flat (no-delimiter) walk of everything under a prefix, for folder-level
// staging. Returns at most `max` objects plus a truncation marker so callers
// can refuse oversized folders instead of silently dropping files.
async function listObjectsRecursive(
  bucket: string,
  prefix: string,
  max: number,
  nodeId?: string | null,
): Promise<{ objects: ObjectEntry[]; truncated: boolean }> {
  const objects: ObjectEntry[] = []
  let token: string | undefined
  for (;;) {
    const response = await client(nodeId).send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix || undefined,
        ContinuationToken: token,
        MaxKeys: Math.min(1000, max + 1 - objects.length),
      }),
    )
    for (const entry of response.Contents ?? []) {
      // Zero-byte folder markers are plumbing, not stageable files.
      if (!entry.Key || entry.Key.endsWith('/')) continue
      if (objects.length === max) return { objects, truncated: true }
      objects.push({
        key: entry.Key,
        name: entry.Key.slice(prefix.length),
        size: entry.Size,
        lastModified: entry.LastModified,
        etag: entry.ETag?.replaceAll('"', ''),
      })
    }
    if (!response.IsTruncated || !response.NextContinuationToken) return { objects, truncated: false }
    token = response.NextContinuationToken
  }
}

export interface UploadHandle {
  promise: Promise<void>
  abort: () => Promise<void>
}

// Files larger than one part are uploaded via S3 multipart with parallel
// parts; abort() tells the node to drop the parts already written.
const UPLOAD_PART_SIZE = 16 * 1024 * 1024
const UPLOAD_CONCURRENCY = 3

function uploadObject(
  bucket: string,
  key: string,
  file: File,
  onProgress?: (loaded: number, total: number) => void,
  nodeId?: string | null,
): UploadHandle {
  const upload = new Upload({
    client: client(nodeId),
    params: {
      Bucket: bucket,
      Key: key,
      Body: file,
      ContentType: file.type || 'application/octet-stream',
    },
    partSize: UPLOAD_PART_SIZE,
    queueSize: UPLOAD_CONCURRENCY,
    leavePartsOnError: false,
  })
  if (onProgress) {
    upload.on('httpUploadProgress', (progress) => {
      onProgress(progress.loaded ?? 0, progress.total ?? file.size)
    })
  }
  return {
    promise: upload.done().then(() => undefined),
    abort: () => upload.abort(),
  }
}

// S3 folder convention: a zero-byte object whose key ends in '/'.
async function createFolder(
  bucket: string,
  prefix: string,
  name: string,
  nodeId?: string | null,
): Promise<void> {
  await client(nodeId).send(
    new PutObjectCommand({ Bucket: bucket, Key: `${prefix}${name}/`, Body: new Uint8Array(0) }),
  )
}

async function deleteObject(bucket: string, key: string, nodeId?: string | null): Promise<void> {
  await client(nodeId).send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}

export interface DeletePrefixResult {
  deleted: number
  errors: { key: string; message: string }[]
}

// Deletes EVERYTHING under `prefix`, including the zero-byte "folder/" marker
// objects that listObjectsRecursive deliberately skips, in DeleteObjects
// batches of up to 1000 keys. Per-key failures are collected instead of
// aborting the walk so one locked object does not strand the rest.
async function deletePrefix(
  bucket: string,
  prefix: string,
  nodeId?: string | null,
): Promise<DeletePrefixResult> {
  const s3 = client(nodeId)
  let deleted = 0
  const errors: DeletePrefixResult['errors'] = []
  // The zero-byte "folder/" marker object is deleted explicitly even when the
  // listing never returns it (some stores fold it into CommonPrefixes only).
  // Only trailing-slash prefixes have a marker; a bare prefix must never make
  // us delete a real object that merely shares the name.
  const markerKey = prefix.endsWith('/') ? prefix : null
  let markerBatched = false

  const deleteBatch = async (keys: string[]) => {
    const response = await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: keys.map((key) => ({ Key: key })), Quiet: false },
      }),
    )
    const failed = response.Errors ?? []
    deleted += keys.length - failed.length
    for (const failure of failed) {
      // The marker often does not exist as a real object; a failed delete for
      // that specific key must not fail the whole folder delete.
      if (markerKey && failure.Key === markerKey) continue
      errors.push({
        key: failure.Key ?? '(unknown key)',
        message: failure.Message ?? failure.Code ?? 'delete failed',
      })
    }
  }

  let token: string | undefined
  for (;;) {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix || undefined,
        ContinuationToken: token,
        MaxKeys: 1000,
      }),
    )
    const keys = new Set(
      (page.Contents ?? [])
        .map((entry) => entry.Key)
        .filter((key): key is string => Boolean(key)),
    )
    const lastPage = !page.IsTruncated || !page.NextContinuationToken
    if (markerKey && !markerBatched && (keys.has(markerKey) || lastPage)) {
      keys.add(markerKey)
      markerBatched = true
    }
    if (keys.size) await deleteBatch([...keys])
    if (lastPage) break
    token = page.NextContinuationToken
  }

  // Verify the marker is really gone. A versioned store can keep the folder
  // visible behind a delete marker; best-effort purge every version of the
  // marker key. All of this is non-fatal: stores without versioning support
  // reject the calls and the bulk delete above already did the real work.
  if (markerKey) {
    try {
      const check = await s3.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: markerKey, MaxKeys: 1 }),
      )
      if ((check.KeyCount ?? check.Contents?.length ?? 0) > 0) {
        const versions = await s3.send(
          new ListObjectVersionsCommand({ Bucket: bucket, Prefix: markerKey, MaxKeys: 1000 }),
        )
        const stale = [...(versions.Versions ?? []), ...(versions.DeleteMarkers ?? [])]
          .filter((entry) => entry.Key === markerKey && entry.VersionId)
          .map((entry) => ({ Key: entry.Key as string, VersionId: entry.VersionId as string }))
        if (stale.length) {
          await s3.send(
            new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: stale, Quiet: true } }),
          )
        }
      }
    } catch {
      // Version purge unsupported or forbidden here; nothing more we can do.
    }
  }
  return { deleted, errors }
}

// Removes the bucket itself. S3 only drops an EMPTY bucket, so callers empty it
// first (deletePrefix with a bare '' prefix walks and batch-deletes every key).
// A versioning-enabled store keeps noncurrent versions and delete markers after
// that purge and rejects this call with "BucketNotEmpty", surfaced distinctly
// via isS3BucketNotEmptyError so the UI can explain the leftover versions.
async function deleteBucket(bucket: string, nodeId?: string | null): Promise<void> {
  await client(nodeId).send(new DeleteBucketCommand({ Bucket: bucket }))
}

// Single-object HEAD, mainly for the user metadata: reference-backed objects
// expose aruna-last-refresh / aruna-source-etag there (lib/references.ts).
async function headObject(bucket: string, key: string, nodeId?: string | null): Promise<ObjectHead> {
  const response = await client(nodeId).send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
  return {
    size: response.ContentLength,
    contentType: response.ContentType,
    etag: response.ETag?.replaceAll('"', ''),
    lastModified: response.LastModified,
    metadata: response.Metadata ?? {},
  }
}

async function downloadUrl(bucket: string, key: string, nodeId?: string | null): Promise<string> {
  return getSignedUrl(client(nodeId), new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: 900,
  })
}

// Fetch an object's bytes in the browser through a short-lived presigned GET so
// previews can read content directly. A cross-origin fetch needs the bucket to
// allow this portal's origin (CORS); when it does not the browser rejects with
// a TypeError, which the caller treats as the known CORS gap.
async function fetchObject(bucket: string, key: string, nodeId?: string | null): Promise<Response> {
  const url = await downloadUrl(bucket, key, nodeId)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`The object could not be fetched (HTTP ${response.status}).`)
  return response
}

async function getObjectText(bucket: string, key: string, nodeId?: string | null): Promise<string> {
  return (await fetchObject(bucket, key, nodeId)).text()
}

async function getObjectBlob(bucket: string, key: string, nodeId?: string | null): Promise<Blob> {
  return (await fetchObject(bucket, key, nodeId)).blob()
}

export function s3ErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const error = err as { name?: string; message?: string }
    if (error.name && error.message) return `${error.name}: ${error.message}`
    if (error.message) return error.message
  }
  return String(err)
}

// DeleteBucket refuses a non-empty bucket with the S3 code "BucketNotEmpty"
// (HTTP 409). After a full object purge this only happens on a versioning-
// enabled store, where noncurrent versions and delete markers survive the
// version-less DeleteObjects batches, a case the browser cannot clear.
export function isS3BucketNotEmptyError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const error = err as { name?: string; Code?: string }
  return error.name === 'BucketNotEmpty' || error.Code === 'BucketNotEmpty'
}

const S3_AUTH_ERROR_NAMES = new Set([
  'InvalidAccessKeyId',
  'SignatureDoesNotMatch',
  'ExpiredToken',
  'TokenRefreshRequired',
  'InvalidToken',
  'AccessDenied',
])

// The node rejects writes above the group's grace ceiling with the custom
// S3 code "QuotaExceeded" and HTTP 403 (aruna api/src/s3/error.rs). The SDK
// exposes the code as the error name.
export function isS3QuotaError(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { name?: string }).name === 'QuotaExceeded')
}

// A request that never produced an HTTP response: the endpoint is unreachable
// or the browser blocked it (CORS rejections surface as an opaque fetch
// TypeError). Distinct from auth/quota errors, which prove the node answered —
// remote browsing degrades to an info panel on this class of failure.
export function isS3NetworkError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const error = err as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } }
  if (error.$metadata?.httpStatusCode !== undefined) return false
  if (error.name === 'TypeError' || error.name === 'NetworkError' || error.name === 'NetworkingError') {
    return true
  }
  const message = error.message ?? ''
  return /failed to fetch|networkerror|load failed|network request failed/i.test(message)
}

// A rejected, expired or revoked key surfaces as one of these SDK error names
// or as a 401/403 from the node — distinct from a transient network or server
// fault, so the UI can offer to mint a fresh key instead of just showing text.
export function isS3AuthError(err: unknown): boolean {
  // A full group is a 403 too; never misreport it as "credentials rejected".
  if (isS3QuotaError(err)) return false
  if (err && typeof err === 'object') {
    const error = err as { name?: string; $metadata?: { httpStatusCode?: number } }
    if (error.name && S3_AUTH_ERROR_NAMES.has(error.name)) return true
    const status = error.$metadata?.httpStatusCode
    if (status === 401 || status === 403) return true
  }
  return false
}

export function useS3() {
  return {
    activeKey,
    hasActiveKey,
    endpoint,
    endpointForNode,
    resolveObjectUrl,
    setActiveKey,
    clearActiveKey,
    listBuckets,
    createBucket,
    allowPublicReadCors,
    putTextObject,
    listObjects,
    listObjectsRecursive,
    createFolder,
    uploadObject,
    deleteObject,
    deletePrefix,
    deleteBucket,
    headObject,
    downloadUrl,
    getObjectText,
    getObjectBlob,
  }
}
