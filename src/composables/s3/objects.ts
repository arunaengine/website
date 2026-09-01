import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
  PutObjectCommand,
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
import { PURGE_IN_PROGRESS_MESSAGE } from './errors'
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
  /** Names the exact stored version, what a content lookup is keyed by. */
  versionId?: string
  /** User metadata; the SDK strips the x-amz-meta- prefix from the keys. */
  metadata: Record<string, string>
}

export interface UploadHandle {
  promise: Promise<void>
  abort: () => Promise<void>
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
): Promise<{ versionId: string | null }> {
  const response = await client().send(
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
const UPLOAD_PART_SIZE = 16 * 1024 * 1024
const UPLOAD_CONCURRENCY = 3

export function uploadObject(
  bucket: string,
  key: string,
  file: File,
  onProgress?: (loaded: number, total: number) => void,
  nodeId?: string | null,
  sessionReference?: S3SessionReference,
): UploadHandle {
  const upload = new Upload({
    client: client(nodeId, sessionReference),
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

// Applies version-less deletes to every current key under `prefix`, including
// the zero-byte "folder/" marker that listObjectsRecursive deliberately skips,
// in DeleteObjects batches of up to 1000 keys. In a versioned bucket this
// creates delete markers and preserves historical versions. Per-key failures
// are collected instead of aborting the walk so one locked object does not
// strand the rest.
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
      // The marker often does not exist as a real object; a failed delete for
      // that specific key must not fail the whole folder delete.
      if (markerKey && failure.Key === markerKey && failure.Code !== 'PurgeInProgress') continue
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
export async function headObject(bucket: string, key: string, nodeId?: string | null): Promise<ObjectHead> {
  const response = await client(nodeId).send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
  return {
    size: response.ContentLength,
    contentType: response.ContentType,
    etag: response.ETag?.replaceAll('"', ''),
    lastModified: response.LastModified,
    versionId: response.VersionId,
    metadata: response.Metadata ?? {},
  }
}

export async function downloadUrl(bucket: string, key: string, nodeId?: string | null): Promise<string> {
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

export async function getObjectText(bucket: string, key: string, nodeId?: string | null): Promise<string> {
  return (await fetchObject(bucket, key, nodeId)).text()
}

export async function getObjectBlob(bucket: string, key: string, nodeId?: string | null): Promise<Blob> {
  return (await fetchObject(bucket, key, nodeId)).blob()
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
