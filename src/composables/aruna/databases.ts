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
import { nodeClient, refreshContext, saving } from './state'

// ── Bucket metadata and releases, asked of the node that holds the bucket ───

async function change<T>(work: () => Promise<T>): Promise<T> {
  saving.value = true
  try {
    return await work()
  } finally {
    saving.value = false
  }
}

export function getBucketMetadata(bucket: string, nodeId?: string | null, signal?: AbortSignal): Promise<BucketMetadata | null> {
  return requestMetadata(bucket, nodeClient(nodeId), signal)
}

export const putBucketMetadata = (bucket: string, metadata: BucketMetadata | null, nodeId?: string | null): Promise<BucketMetadata | null> =>
  change(() => requestPutMetadata(bucket, metadata, nodeClient(nodeId)))

export function listReleases(bucket: string, nodeId?: string | null, signal?: AbortSignal): Promise<ReleaseListResponse> {
  return requestReleases(bucket, nodeClient(nodeId), signal)
}

export const publishRelease = (bucket: string, body: PublishReleaseRequest, nodeId?: string | null): Promise<PublishReleaseResponse> =>
  change(() => requestPublish(bucket, body, nodeClient(nodeId)))

export function testIdentifierRules(body: { parser: IdentifierParser; key: string; source_url?: string | null }): Promise<FoundIdentifier[]> {
  return requestRulesTest(body, refreshContext().client)
}
