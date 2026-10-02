import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  UploadPartCommand,
  type CompleteMultipartUploadCommandInput,
  type Part,
  type S3Client,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import {
  deletedEntries,
  keyVersions,
  sortVersions,
  type DeletedObjectEntry,
  type ObjectVersionEntry,
} from '@/lib/objectVersions'
import { drsDownloadHref, isDrsReference } from '@/lib/tes'
import { useAruna } from '../useAruna'
import { client } from './client'
import { resolveObjectUrl } from './endpoints'
import { isS3AuthError, isS3NetworkError, PURGE_IN_PROGRESS_MESSAGE } from './errors'
import { hasActiveKey, type S3SessionReference } from './session'

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
  /** The version this HEAD resolved to; versioning is always on. */
  versionId?: string
  /** User metadata; the SDK strips the x-amz-meta- prefix from the keys. */
  metadata: Record<string, string>
}

export interface UploadHandle {
  promise: Promise<void>
  abort: () => Promise<void>
  /** The multipart upload a failed attempt kept on the node for `resumeUpload`. */
  uploadId: () => string | null
}

export interface DeletePrefixResult {
  deleted: number
  errors: { key: string; message: string }[]
}

const { authToken, apiBaseUrl } = useAruna()

// Small generated artifacts (profile mode/schema/html): a single PutObject,
// no multipart machinery.
export async function putTextObject(
  bucket: string,
  key: string,
  text: string,
  contentType: string,
  nodeId?: string | null,
  reference?: S3SessionReference,
): Promise<{ versionId: string | null }> {
  const response = await client(nodeId, reference).send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: new TextEncoder().encode(text),
      ContentType: contentType,
    }),
  )
  return { versionId: response.VersionId ?? null }
}

export async function listObjects(
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
export async function listObjectsRecursive(
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

// Files larger than one part are uploaded via S3 multipart with parallel
// parts; abort() tells the node to drop the parts already written.
export const UPLOAD_PART_SIZE = 16 * 1024 * 1024
const UPLOAD_CONCURRENCY = 3
const MAX_UPLOAD_PARTS = 10_000
const MIB = 1024 * 1024

/** Parts grow in whole MiB above the default so any file fits the S3 limit of 10,000 parts. */
export function uploadPartSize(bytes: number): number {
  return Math.max(UPLOAD_PART_SIZE, Math.ceil(bytes / MAX_UPLOAD_PARTS / MIB) * MIB)
}

// Composing a multi-GB object out of its parts keeps the node busy for minutes
// and a proxy in between may drop the idle connection first. The parts are
// already stored, so a lost completion is repeated with the same upload id
// until the object exists or this window closes.
const COMPLETION_WINDOW_MS = 10 * 60 * 1000
const COMPLETION_BACKOFF_MS = 2000
const COMPLETION_BACKOFF_CAP_MS = 30 * 1000

// One failed part makes lib-storage abort the whole upload, so a transient
// part failure is repeated first. A part number may be uploaded again safely.
const PART_ATTEMPTS = 4
const PART_BACKOFF_MS = 2000

// Faults that a repeated completion can never clear. Everything else is judged
// by transport: a lost request, a timeout or a 5xx may be repeated, a 4xx not.
const TERMINAL_COMPLETION_CODES = new Set([
  'AbortError',
  'EntityTooSmall',
  'InvalidPart',
  'InvalidPartOrder',
  'MalformedXML',
  'NoSuchBucket',
  'NoSuchKey',
  'NoSuchUpload',
])

// The node answers a completion that is already running with OperationAborted,
// and a retry then joins it or returns the finished object.
function retryableCompletion(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const error = err as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } }
  const code = error.Code ?? error.name
  if (code && TERMINAL_COMPLETION_CODES.has(code)) return false
  if (code === 'OperationAborted') return true
  if (isS3AuthError(err)) return false
  const status = error.$metadata?.httpStatusCode
  // A 2xx body that could not be read, such as a cut-off keepalive, leaves the outcome unknown.
  if (status !== undefined && status < 300) return !error.Code
  if (status !== undefined) return status >= 500
  return isS3NetworkError(err) || code === 'TimeoutError'
}

interface CompletionRecorder {
  client: S3Client
  completion: () => CompleteMultipartUploadCommandInput | null
  uploadId: () => string | null
  /** Aborts the kept multipart upload, if any, so its parts leave the node. */
  discard: () => Promise<void>
}

// lib-storage sends every request through the client, so wrapping send()
// captures the upload id and the completion it assembled without reading its internals.
function recordCompletion(
  s3: S3Client,
  canceled: { value: boolean },
  target: { Bucket: string; Key: string },
  initialUploadId: string | null = null,
): CompletionRecorder {
  let completion: CompleteMultipartUploadCommandInput | null = null
  let uploadId = initialUploadId
  const send = s3.send.bind(s3) as unknown as (command: unknown) => Promise<unknown>
  const recorded = new Proxy(s3, {
    get(target, property) {
      if (property !== 'send') return Reflect.get(target, property)
      return (command: unknown) => {
        if (command instanceof CompleteMultipartUploadCommand) completion = command.input
        if (command instanceof UploadPartCommand) return sendPart(send, command, canceled)
        if (command instanceof CreateMultipartUploadCommand) {
          return send(command).then((created) => {
            uploadId = (created as { UploadId?: string }).UploadId ?? null
            return created
          })
        }
        return send(command)
      }
    },
  })
  return {
    client: recorded,
    completion: () => completion,
    uploadId: () => uploadId,
    discard: async () => {
      const kept = uploadId
      uploadId = null
      if (kept) await abortMultipart(recorded, { ...target, UploadId: kept })
    },
  }
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// A part is judged by the same transport rules as a completion.
async function sendPart(
  send: (command: unknown) => Promise<unknown>,
  command: UploadPartCommand,
  canceled: { value: boolean },
): Promise<unknown> {
  let delay = PART_BACKOFF_MS
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await send(command)
    } catch (err) {
      if (attempt >= PART_ATTEMPTS || canceled.value || !retryableCompletion(err)) throw err
      await pause(delay)
      if (canceled.value) throw err
      delay *= 2
    }
  }
}

// Best effort: the original failure is what the caller must see, and a node
// that already forgot the upload answers NoSuchUpload.
async function abortMultipart(
  s3: S3Client,
  completion: CompleteMultipartUploadCommandInput,
): Promise<void> {
  try {
    await s3.send(
      new AbortMultipartUploadCommand({
        Bucket: completion.Bucket,
        Key: completion.Key,
        UploadId: completion.UploadId,
      }),
    )
  } catch {
    return
  }
}

async function retryCompletion(
  s3: S3Client,
  completion: CompleteMultipartUploadCommandInput,
  first: unknown,
  canceled: { value: boolean },
  onRetry?: (attempt: number, error: unknown) => void,
): Promise<void> {
  const deadline = Date.now() + COMPLETION_WINDOW_MS
  let failure = first
  let delay = COMPLETION_BACKOFF_MS
  let attempt = 1
  while (retryableCompletion(failure) && !canceled.value && Date.now() + delay <= deadline) {
    attempt += 1
    onRetry?.(attempt, failure)
    await pause(delay)
    if (canceled.value) break
    try {
      const result = await s3.send(new CompleteMultipartUploadCommand(completion))
      if (result.ETag) return
      failure = missingResult()
    } catch (err) {
      failure = err
    }
    delay = Math.min(delay * 2, COMPLETION_BACKOFF_CAP_MS)
  }
  throw failure
}

// A 200 without a completion result, such as a proxy page, proves nothing; repeating joins the node.
function missingResult(): Error {
  return Object.assign(new Error('The node answered the completion without a result.'), {
    $metadata: { httpStatusCode: 200 },
  })
}

async function settleCompletion(
  recorder: CompletionRecorder,
  completion: CompleteMultipartUploadCommandInput,
  first: unknown,
  canceled: { value: boolean },
  onRetry?: (attempt: number, error: unknown) => void,
): Promise<void> {
  try {
    await retryCompletion(recorder.client, completion, first, canceled, onRetry)
  } catch (exhausted) {
    // Only a permanent failure justifies dropping the parts: a completion the
    // node may still be running has to outlive the retry window.
    if (!canceled.value && !retryableCompletion(exhausted)) await recorder.discard()
    throw exhausted
  }
}

async function finishUpload(
  upload: Upload,
  recorder: CompletionRecorder,
  canceled: { value: boolean },
  resumable: boolean,
  onRetry?: (attempt: number, error: unknown) => void,
): Promise<void> {
  let failure: unknown
  try {
    const result = await upload.done()
    const completion = recorder.completion()
    if (!completion || (result as { ETag?: string }).ETag) return
    failure = missingResult()
  } catch (err) {
    // A canceled upload was aborted by the handle.
    if (canceled.value) throw err
    if (!recorder.completion()) {
      // A part failed after its own retries; only a resumable upload keeps the stored parts.
      if (!resumable) await recorder.discard()
      throw err
    }
    failure = err
  }
  const completion = recorder.completion()
  if (completion) await settleCompletion(recorder, completion, failure, canceled, onRetry)
}

export function uploadObject(
  bucket: string,
  key: string,
  file: File,
  onProgress?: (loaded: number, total: number) => void,
  nodeId?: string | null,
  sessionReference?: S3SessionReference,
  onCompletionRetry?: (attempt: number, error: unknown) => void,
  resumable = false,
): UploadHandle {
  const canceled = { value: false }
  const recorder = recordCompletion(client(nodeId, sessionReference), canceled, {
    Bucket: bucket,
    Key: key,
  })
  const upload = new Upload({
    client: recorder.client,
    params: {
      Bucket: bucket,
      Key: key,
      Body: file,
      ContentType: file.type || 'application/octet-stream',
    },
    partSize: uploadPartSize(file.size),
    queueSize: UPLOAD_CONCURRENCY,
    // The recorder owns the parts: it keeps them for a resume or discards them.
    leavePartsOnError: true,
  })
  if (onProgress) {
    upload.on('httpUploadProgress', (progress) => {
      onProgress(progress.loaded ?? 0, progress.total ?? file.size)
    })
  }
  return {
    promise: finishUpload(upload, recorder, canceled, resumable, onCompletionRetry),
    abort: async () => {
      canceled.value = true
      await upload.abort()
      await recorder.discard()
    },
    uploadId: recorder.uploadId,
  }
}

async function storedParts(
  s3: S3Client,
  target: { Bucket: string; Key: string; UploadId: string },
): Promise<Map<number, Part>> {
  const parts = new Map<number, Part>()
  let marker: string | undefined
  for (;;) {
    const page = await s3.send(new ListPartsCommand({ ...target, PartNumberMarker: marker }))
    for (const part of page.Parts ?? []) if (part.PartNumber) parts.set(part.PartNumber, part)
    if (!page.IsTruncated || !page.NextPartNumberMarker) return parts
    marker = page.NextPartNumberMarker
  }
}

/**
 * Continues a multipart upload a failed attempt kept on the node. Stored parts of the expected
 * size are reused and only the missing ones are sent. NoSuchUpload means the node dropped it.
 */
export function resumeUpload(
  bucket: string,
  key: string,
  file: File,
  uploadId: string,
  onProgress?: (loaded: number, total: number) => void,
  nodeId?: string | null,
  sessionReference?: S3SessionReference,
  onCompletionRetry?: (attempt: number, error: unknown) => void,
): UploadHandle {
  const canceled = { value: false }
  const target = { Bucket: bucket, Key: key, UploadId: uploadId }
  const recorder = recordCompletion(client(nodeId, sessionReference), canceled, target, uploadId)
  const run = async () => {
    const partSize = uploadPartSize(file.size)
    const count = Math.max(1, Math.ceil(file.size / partSize))
    const stop = () => {
      if (canceled.value) throw new DOMException('The upload was canceled.', 'AbortError')
    }
    const stored = await storedParts(recorder.client, target)
    stop()
    const etags = new Map<number, string>()
    const missing: number[] = []
    let loaded = 0
    for (let number = 1; number <= count; number += 1) {
      const size = Math.min(partSize, file.size - (number - 1) * partSize)
      const part = stored.get(number)
      if (part?.ETag && part.Size === size) {
        etags.set(number, part.ETag)
        loaded += size
      } else {
        missing.push(number)
      }
    }
    onProgress?.(loaded, file.size)
    let failed = false
    const worker = async () => {
      try {
        for (let number = missing.shift(); number !== undefined && !failed; number = missing.shift()) {
          stop()
          const start = (number - 1) * partSize
          const body = file.slice(start, Math.min(start + partSize, file.size))
          const sent = await recorder.client.send(
            new UploadPartCommand({ ...target, PartNumber: number, Body: body }),
          )
          if (!sent.ETag) throw new Error(`The node returned no ETag for part ${number}.`)
          etags.set(number, sent.ETag)
          loaded += body.size
          onProgress?.(loaded, file.size)
        }
      } catch (err) {
        failed = true
        throw err
      }
    }
    // One failed part stops the others from starting more; the attempt ends once all have settled.
    const settled = await Promise.allSettled(Array.from({ length: UPLOAD_CONCURRENCY }, worker))
    const rejected = settled.find((result) => result.status === 'rejected')
    if (rejected) throw rejected.reason
    stop()
    const completion: CompleteMultipartUploadCommandInput = {
      ...target,
      MultipartUpload: {
        Parts: [...etags]
          .sort(([left], [right]) => left - right)
          .map(([PartNumber, ETag]) => ({ PartNumber, ETag })),
      },
    }
    let failure: unknown
    try {
      const result = await recorder.client.send(new CompleteMultipartUploadCommand(completion))
      if (result.ETag) return
      failure = missingResult()
    } catch (err) {
      if (canceled.value) throw err
      failure = err
    }
    await settleCompletion(recorder, completion, failure, canceled, onCompletionRetry)
  }
  return {
    promise: run(),
    abort: async () => {
      canceled.value = true
      await recorder.discard()
    },
    uploadId: recorder.uploadId,
  }
}

/** Drops a multipart upload a failed attempt kept, so its parts leave the node. */
export async function discardUpload(
  bucket: string,
  key: string,
  uploadId: string,
  nodeId?: string | null,
  sessionReference?: S3SessionReference,
): Promise<void> {
  await abortMultipart(client(nodeId, sessionReference), {
    Bucket: bucket,
    Key: key,
    UploadId: uploadId,
  })
}

// S3 folder convention: a zero-byte object whose key ends in '/'.
export async function createFolder(
  bucket: string,
  prefix: string,
  name: string,
  nodeId?: string | null,
): Promise<void> {
  await client(nodeId).send(
    new PutObjectCommand({ Bucket: bucket, Key: `${prefix}${name}/`, Body: new Uint8Array(0) }),
  )
}

export async function deleteObject(bucket: string, key: string, nodeId?: string | null): Promise<void> {
  await client(nodeId).send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}

// One page holds 1000 rows and one key rarely has more; the cap keeps a
// pathological history from paging forever and is reported to the caller.
const VERSION_PAGE_SIZE = 1000
const VERSION_LIMIT = 1000

export interface ObjectVersionList {
  versions: ObjectVersionEntry[]
  truncated: boolean
}

/** Every version and delete marker of one key, newest first. */
export async function listObjectVersions(
  bucket: string,
  key: string,
  nodeId?: string | null,
): Promise<ObjectVersionList> {
  const versions: ObjectVersionEntry[] = []
  let keyMarker: string | undefined
  let versionMarker: string | undefined
  for (;;) {
    const page = await client(nodeId).send(
      new ListObjectVersionsCommand({
        Bucket: bucket,
        Prefix: key,
        KeyMarker: keyMarker,
        VersionIdMarker: versionMarker,
        MaxKeys: VERSION_PAGE_SIZE,
      }),
    )
    versions.push(...keyVersions(page, key))
    if (versions.length >= VERSION_LIMIT) {
      return { versions: sortVersions(versions).slice(0, VERSION_LIMIT), truncated: true }
    }
    keyMarker = page.NextKeyMarker
    versionMarker = page.NextVersionIdMarker
    if (!page.IsTruncated || (!keyMarker && !versionMarker)) {
      return { versions: sortVersions(versions), truncated: false }
    }
  }
}

export interface DeletedObjectList {
  deleted: DeletedObjectEntry[]
  truncated: boolean
}

/**
 * Keys directly under `prefix` whose head is a delete marker. ListObjectsV2
 * hides them, so this is the only way the browser can offer them back.
 */
export async function listDeletedObjects(
  bucket: string,
  prefix: string,
  nodeId?: string | null,
): Promise<DeletedObjectList> {
  const deleted: DeletedObjectEntry[] = []
  let keyMarker: string | undefined
  let versionMarker: string | undefined
  for (;;) {
    const page = await client(nodeId).send(
      new ListObjectVersionsCommand({
        Bucket: bucket,
        Prefix: prefix || undefined,
        Delimiter: '/',
        KeyMarker: keyMarker,
        VersionIdMarker: versionMarker,
        MaxKeys: VERSION_PAGE_SIZE,
      }),
    )
    deleted.push(...deletedEntries(page, prefix))
    if (deleted.length >= VERSION_LIMIT) {
      return { deleted: deleted.slice(0, VERSION_LIMIT), truncated: true }
    }
    keyMarker = page.NextKeyMarker
    versionMarker = page.NextVersionIdMarker
    if (!page.IsTruncated || (!keyMarker && !versionMarker)) return { deleted, truncated: false }
  }
}

// A hard delete of exactly one version, marker included. When it was the head
// the head moves to the newest remaining version, so deleting a delete marker
// restores the object. Node-local: no other node is told.
export async function deleteObjectVersion(
  bucket: string,
  key: string,
  versionId: string,
  nodeId?: string | null,
): Promise<void> {
  await client(nodeId).send(
    new DeleteObjectCommand({ Bucket: bucket, Key: key, VersionId: versionId }),
  )
}

// Makes an older version current by copying it onto the key, which mints a new
// version. The source version keeps its bytes until it is deleted.
export async function copyObjectVersion(
  bucket: string,
  key: string,
  versionId: string,
  nodeId?: string | null,
): Promise<{ versionId: string | null }> {
  const response = await client(nodeId).send(
    new CopyObjectCommand({
      Bucket: bucket,
      Key: key,
      CopySource: `${encodeURIComponent(bucket)}/${encodeURI(key)}?versionId=${encodeURIComponent(versionId)}`,
      MetadataDirective: 'COPY',
    }),
  )
  return { versionId: response.VersionId ?? null }
}

// Server-side copy of the current version of one object onto another key,
// in the same or another bucket on this node.
export async function copyObject(
  source: { bucket: string; key: string },
  bucket: string,
  key: string,
  nodeId?: string | null,
): Promise<void> {
  await client(nodeId).send(
    new CopyObjectCommand({
      Bucket: bucket,
      Key: key,
      CopySource: `${encodeURIComponent(source.bucket)}/${encodeURI(source.key)}`,
      MetadataDirective: 'COPY',
    }),
  )
}

// Applies version-less deletes to every current key under `prefix`, including
// the zero-byte "folder/" marker that listObjectsRecursive deliberately skips,
// in DeleteObjects batches of up to 1000 keys. In a versioned bucket this
// creates delete markers and preserves historical versions. Per-key failures
// are collected instead of aborting the walk so one locked object does not
// strand the rest.
const MISSING_KEY_CODES = new Set(['NoSuchKey', 'NoSuchVersion', 'NotFound'])

export async function deletePrefix(
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
      // The marker often does not exist as a real object, so only that reason
      // is skipped; every other failure on it is a real folder-delete failure.
      if (markerKey && failure.Key === markerKey && MISSING_KEY_CODES.has(failure.Code ?? '')) {
        continue
      }
      errors.push({
        key: failure.Key ?? '(unknown key)',
        message:
          failure.Code === 'PurgeInProgress'
            ? PURGE_IN_PROGRESS_MESSAGE
            : failure.Message ?? failure.Code ?? 'delete failed',
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

  return { deleted, errors }
}

// Single-object HEAD, mainly for the user metadata: reference-backed objects
// expose aruna-last-refresh / aruna-source-etag there (lib/references.ts).
export async function headObject(
  bucket: string,
  key: string,
  nodeId?: string | null,
  versionId?: string,
  reference?: S3SessionReference,
): Promise<ObjectHead> {
  const response = await client(nodeId, reference).send(
    new HeadObjectCommand({ Bucket: bucket, Key: key, VersionId: versionId }),
  )
  return {
    size: response.ContentLength,
    contentType: response.ContentType,
    etag: response.ETag?.replaceAll('"', ''),
    lastModified: response.LastModified,
    versionId: response.VersionId,
    metadata: response.Metadata ?? {},
  }
}

// A version id belongs in the signed request, never appended afterwards: the
// query string is part of what SigV4 signs. `filename` makes the node answer
// with a Content-Disposition, which is what carries the name across origins;
// a preview reads the bytes itself and passes none.
export async function downloadUrl(
  bucket: string,
  key: string,
  nodeId?: string | null,
  versionId?: string,
  filename?: string,
  reference?: S3SessionReference,
): Promise<string> {
  return getSignedUrl(
    client(nodeId, reference),
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      VersionId: versionId,
      ResponseContentDisposition: filename
        ? `attachment; filename="${filename.replaceAll('"', '')}"`
        : undefined,
    }),
    { expiresIn: 900 },
  )
}

// Fetch an object's bytes in the browser through a short-lived presigned GET so
// previews can read content directly. A cross-origin fetch needs the bucket to
// allow this portal's origin (CORS); when it does not the browser rejects with
// a TypeError, which the caller treats as the known CORS gap.
async function fetchObject(
  bucket: string,
  key: string,
  nodeId?: string | null,
  versionId?: string,
  reference?: S3SessionReference,
): Promise<Response> {
  const url = await downloadUrl(bucket, key, nodeId, versionId, undefined, reference)
  const response = await fetch(url)
  if (!response.ok) {
    throw Object.assign(new Error(`The object could not be fetched (HTTP ${response.status}).`), {
      $metadata: { httpStatusCode: response.status },
    })
  }
  return response
}

export async function getObjectText(
  bucket: string,
  key: string,
  nodeId?: string | null,
  versionId?: string,
  reference?: S3SessionReference,
): Promise<string> {
  return (await fetchObject(bucket, key, nodeId, versionId, reference)).text()
}

export async function getObjectBlob(
  bucket: string,
  key: string,
  nodeId?: string | null,
  versionId?: string,
): Promise<Blob> {
  return (await fetchObject(bucket, key, nodeId, versionId)).blob()
}

// One profile artifact (or a pasted document itself) fetched as text. A URL that
// maps to a bucket on one of this realm's nodes is read through an authenticated
// presigned GetObject, the same signed path the profiles view uses, so it works
// even when the object is not anonymously public or its bucket predates the
// public-read CORS rule. A portal DRS id (a w3id data URL or content-hash ARN,
// not the GA4GH drs:// scheme) resolves through the connected node's own
// download endpoint rather than following an anonymous w3id.org redirect that
// drops CORS. Anything else is a genuinely external host, fetched directly by
// the browser and subject to that host's CORS policy. Shared by the crate
// importer and the SHACL attach block (via useArtifactFetch) and by
// loadRoCrate when resolving externalized profile artifacts.
export async function fetchUrlText(target: string): Promise<string> {
  const object = hasActiveKey.value ? resolveObjectUrl(target) : null
  if (object) return getObjectText(object.bucket, object.key, object.nodeId)
  if (isDrsReference(target) && !/^drs:\/\//i.test(target)) return fetchDrsText(target)
  // Published profile artifacts keep their URL across updates, so revalidate
  // instead of trusting the HTTP cache's heuristic freshness.
  const response = await fetch(target, { cache: 'no-cache' })
  if (!response.ok) throw new Error(`Fetch failed (${response.status} ${response.statusText}).`)
  return response.text()
}

// Resolve a portal DRS id through the connected node's GA4GH download endpoint,
// carrying the bearer token so non-public objects resolve too. The endpoint
// redirects to a presigned object URL the browser then reads; a remote host that
// still refuses cross-origin reads surfaces as a TypeError, the same honest CORS
// gap a raw fetch would hit, so callers can advise download-and-upload.
async function fetchDrsText(id: string): Promise<string> {
  const base = apiBaseUrl.value
  if (!base) throw new Error('Resolving that DRS id needs the node API endpoint, which is not known yet.')
  const response = await fetch(drsDownloadHref(base, id), {
    headers: authToken.value ? { Authorization: `Bearer ${authToken.value}` } : {},
  })
  if (!response.ok) throw new Error(`DRS resolve failed (${response.status} ${response.statusText}).`)
  return response.text()
}
