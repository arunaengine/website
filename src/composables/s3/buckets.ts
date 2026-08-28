import {
  CreateBucketCommand,
  DeleteBucketCommand,
  GetBucketCorsCommand,
  ListBucketsCommand,
  PutBucketCorsCommand,
  type CORSRule,
} from '@aws-sdk/client-s3'
import { client } from './client'

export interface BucketEntry {
  name: string
  createdAt?: Date
}

export async function listBuckets(): Promise<BucketEntry[]> {
  const response = await client().send(new ListBucketsCommand({}))
  return (response.Buckets ?? [])
    .filter((bucket) => bucket.Name)
    .map((bucket) => ({ name: bucket.Name as string, createdAt: bucket.CreationDate }))
}

export async function createBucket(name: string): Promise<void> {
  await client().send(new CreateBucketCommand({ Bucket: name }))
}

// Removes the bucket itself. S3 only drops an EMPTY bucket, so callers empty it
// first (deletePrefix with a bare '' prefix walks and batch-deletes every key).
// A versioning-enabled store keeps noncurrent versions and delete markers after
// that purge and rejects this call with "BucketNotEmpty", surfaced distinctly
// via isS3BucketNotEmptyError so the UI can explain the leftover versions.
export async function deleteBucket(bucket: string, nodeId?: string | null): Promise<void> {
  await client(nodeId).send(new DeleteBucketCommand({ Bucket: bucket }))
}

// The portal's own public-read rule is tagged by ID so re-publishing swaps it
// idempotently without disturbing rules other tools stored on the bucket.
const PORTAL_CORS_RULE_ID = 'aruna-portal-public-read'

// Read-only CORS for publicly served artifacts: browsers (other portals,
// Crate-O, …) must be able to fetch objects from this bucket cross-origin.
// PutBucketCors REPLACES the bucket's whole config, and a publish destination
// may be an ordinary data bucket, so the existing rules are read first and
// preserved; only the portal's own rule (or its untagged legacy shape) is
// replaced.
export async function allowPublicReadCors(bucket: string): Promise<void> {
  const kept = (await currentCorsRules(bucket)).filter(
    (rule) => rule.ID !== PORTAL_CORS_RULE_ID && !isLegacyPortalCorsRule(rule),
  )
  await client().send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          ...kept,
          {
            ID: PORTAL_CORS_RULE_ID,
            // PUT is required: the publish flow itself uploads the artifacts
            // from the browser right after applying this rule - GET/HEAD-only
            // made those PUTs fail their own preflight. CORS is not access
            // control: writes still need valid signatures; anonymous access
            // stays read-only via the Everyone-principal role.
            AllowedMethods: ['GET', 'HEAD', 'PUT'],
            AllowedOrigins: ['*'],
            AllowedHeaders: ['*'],
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  )
}

async function currentCorsRules(bucket: string): Promise<CORSRule[]> {
  try {
    const response = await client().send(new GetBucketCorsCommand({ Bucket: bucket }))
    return response.CORSRules ?? []
  } catch (err) {
    // A fresh bucket has no stored configuration yet.
    if ((err as { name?: string }).name === 'NoSuchCORSConfiguration') return []
    throw err
  }
}

// The exact rules older portal versions wrote without an ID tag; they are
// replaced like the tagged rule, or every publish would stack another copy.
function isLegacyPortalCorsRule(rule: CORSRule): boolean {
  if (rule.ID) return false
  const methods = [...(rule.AllowedMethods ?? [])].sort().join(',')
  return (
    (methods === 'GET,HEAD' || methods === 'GET,HEAD,PUT') &&
    (rule.AllowedOrigins ?? []).join(',') === '*' &&
    (rule.AllowedHeaders ?? []).join(',') === '*'
  )
}
