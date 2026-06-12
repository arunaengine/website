import { computed, ref } from 'vue'
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
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

// Credentials stay in memory only; a reload requires re-entering or minting
// a fresh key so secrets never touch persistent storage.
const activeKey = ref<S3Key | null>(null)

const endpoint = computed(
  () =>
    nodeInfo.value?.services.interfaces.s3.url ??
    realmInfo.value?.interfaces.s3.url ??
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
}

function clearActiveKey() {
  activeKey.value = null
  cached = null
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

async function uploadObject(bucket: string, key: string, file: File): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file,
      ContentType: file.type || 'application/octet-stream',
    }),
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

export function useS3() {
  return {
    activeKey,
    hasActiveKey,
    endpoint,
    setActiveKey,
    clearActiveKey,
    listBuckets,
    createBucket,
    listObjects,
    uploadObject,
    deleteObject,
    downloadUrl,
  }
}
