import {
  getBucketMetadata as requestMetadata,
  listReleases as requestReleases,
  publishRelease as requestPublish,
  putBucketMetadata as requestPutMetadata,
  testIdentifierRules as requestRulesTest,
  type BucketMetadata,
  type FoundIdentifier,
  type IdentifierParser,
  type PublishReleaseRequest,
  type PublishReleaseResponse,
  type ReleaseListResponse,
} from '@/lib/api'
import { nodeClientReady, refreshContext, saving } from './state'

// ── Bucket metadata and releases, asked of the node that holds the bucket ───

async function change<T>(work: () => Promise<T>): Promise<T> {
  saving.value = true
  try {
    return await work()
  } finally {
    saving.value = false
  }
}

export async function getBucketMetadata(bucket: string, nodeId?: string | null, signal?: AbortSignal): Promise<BucketMetadata | null> {
  return requestMetadata(bucket, await nodeClientReady(nodeId, undefined, signal), signal)
}

export const putBucketMetadata = (bucket: string, metadata: BucketMetadata | null, nodeId?: string | null): Promise<BucketMetadata | null> =>
  change(async () => requestPutMetadata(bucket, metadata, await nodeClientReady(nodeId)))

export async function listReleases(bucket: string, nodeId?: string | null, signal?: AbortSignal): Promise<ReleaseListResponse> {
  return requestReleases(bucket, await nodeClientReady(nodeId, undefined, signal), signal)
}

export const publishRelease = (bucket: string, body: PublishReleaseRequest, nodeId?: string | null): Promise<PublishReleaseResponse> =>
  change(async () => requestPublish(bucket, body, await nodeClientReady(nodeId)))

export function testIdentifierRules(body: { parser: IdentifierParser; key: string; source_url?: string | null }): Promise<FoundIdentifier[]> {
  return requestRulesTest(body, refreshContext().client)
}
