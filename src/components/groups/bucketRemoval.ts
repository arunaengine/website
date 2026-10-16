// Deletes one bucket of a group on the node that serves it: an empty bucket
// goes at once, a full one is purged by the node's purge job first.
import { usePurgeJob } from '@/components/data/deletion/usePurgeJob'
import { useAruna } from '@/composables/useAruna'
import { useS3 } from '@/composables/useS3'
import { nodeApiBase } from '@/composables/s3/endpoints'
import { bucketIsEmpty } from '@/lib/deletion/options'
import {
  createStoragePurgeOperation,
  getStorageDeletionPreflight,
  type StorageDeletionScope,
} from '@/lib/storageDeletion'

export async function removeBucket(nodeId: string, groupId: string, bucket: string): Promise<void> {
  const { authToken } = useAruna()
  const s3 = useS3()
  const baseUrl = nodeApiBase(nodeId)
  if (!baseUrl) throw new Error('This node has no API address.')
  const client = { baseUrl, token: authToken.value || undefined }
  const scope: StorageDeletionScope = { kind: 'bucket', bucket }
  const { counts } = await getStorageDeletionPreflight(scope, client)
  const empty = bucketIsEmpty({
    currentHeads: counts.current_heads,
    noncurrentVersions: counts.noncurrent_versions,
    deleteMarkers: counts.delete_markers,
    openMultipartUploads: counts.open_multipart_uploads,
    complete: counts.complete,
  })
  if (!empty) {
    const status = await usePurgeJob().run(createStoragePurgeOperation(scope), client)
    if (status?.state === 'failed') throw new Error(status.error?.message ?? 'The deletion failed.')
    if (status?.state === 'cancelled') throw new Error('The deletion was cancelled.')
  }
  // Dropping the bucket itself is an S3 call, so it needs a session on that node.
  await s3.activateContext(nodeId, groupId)
  await s3.deleteBucket(bucket, nodeId)
}
