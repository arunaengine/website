import { computed, ref } from 'vue'
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
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

const { nodeInfo, realmInfo } = useAruna()

const STORAGE_KEY = 'aruna.s3Key'

function loadStoredKey(): S3Key | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<S3Key>
    if (typeof parsed.accessKeyId === 'string' && typeof parsed.secretAccessKey === 'string') {
      return { accessKeyId: parsed.accessKeyId, secretAccessKey: parsed.secretAccessKey }
    }
  } catch {
    // fall through to no key
  }
  return null
}

const activeKey = ref<S3Key | null>(loadStoredKey())

const endpoint = computed(
  () =>
    nodeInfo.value?.services?.interfaces?.s3?.url ??
    realmInfo.value?.interfaces?.s3?.url ??
    null,
)

const hasActiveKey = computed(() => activeKey.value !== null)

let cached: { endpoint: string; key: S3Key; client: S3Client } | null = null

function client(): S3Client {
  const url = endpoint.value
  const key = activeKey.value
  if (!url) throw new Error('The node does not advertise an S3 endpoint')
  if (!key) throw new Error('No active S3 credentials')
  if (!cached || cached.endpoint !== url || cached.key !== key) {
    cached = {
      endpoint: url,
      key,
      client: new S3Client({
        endpoint: url,
        region: 'us-east-1',
        forcePathStyle: true,
        credentials: { accessKeyId: key.accessKeyId, secretAccessKey: key.secretAccessKey },
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      }),
    }
  }
  return cached.client
}

function setActiveKey(key: S3Key) {
  activeKey.value = key
  localStorage.setItem(STORAGE_KEY, JSON.stringify(key))
}

function clearActiveKey() {
  activeKey.value = null
  cached = null
  localStorage.removeItem(STORAGE_KEY)
}

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

async function listObjects(bucket: string, prefix: string, token?: string): Promise<ObjectPage> {
  const response = await client().send(
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
): UploadHandle {
  const upload = new Upload({
    client: client(),
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
async function createFolder(bucket: string, prefix: string, name: string): Promise<void> {
  await client().send(
    new PutObjectCommand({ Bucket: bucket, Key: `${prefix}${name}/`, Body: new Uint8Array(0) }),
  )
}

async function deleteObject(bucket: string, key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}

async function downloadUrl(bucket: string, key: string): Promise<string> {
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: 900,
  })
}

export function s3ErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const error = err as { name?: string; message?: string }
    if (error.name && error.message) return `${error.name}: ${error.message}`
    if (error.message) return error.message
  }
  return String(err)
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
    setActiveKey,
    clearActiveKey,
    listBuckets,
    createBucket,
    allowPublicReadCors,
    putTextObject,
    listObjects,
    createFolder,
    uploadObject,
    deleteObject,
    downloadUrl,
  }
}
