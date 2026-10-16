// Deletes one bucket of a group on the node that serves it. The node's purge
// job removes every version and then the bucket itself, so no S3 session opens.
import { usePurgeJob, type PurgeJob } from '@/components/data/deletion/usePurgeJob'
import { useAruna } from '@/composables/useAruna'
import { nodeApiBase } from '@/composables/s3/endpoints'
import { useConnectivity } from '@/lib/connectivity'
import {
  createStoragePurgeOperation,
  getStorageDeletionPreflight,
  type StorageDeletionScope,
} from '@/lib/storageDeletion'

export async function removeBucket(
  nodeId: string,
  bucket: string,
  job: PurgeJob = usePurgeJob(),
): Promise<void> {
  const { authToken, sessionEpoch } = useAruna()
  const { writesDisabled } = useConnectivity()
  const epoch = sessionEpoch.value
  const baseUrl = nodeApiBase(nodeId)
  if (!baseUrl) throw new Error('This node has no API address.')
  const client = { baseUrl, token: authToken.value || undefined }
  const scope: StorageDeletionScope = { kind: 'bucket', bucket }
  const { permissions } = await getStorageDeletionPreflight(scope, client)
  // The account or the connection may have changed while the node answered.
  if (sessionEpoch.value !== epoch) throw new Error('Your session changed. Nothing was deleted.')
  if (writesDisabled.value) throw new Error('You are offline. Nothing was deleted.')
  if (!permissions.purge) throw new Error('You may not delete this bucket.')
  const status = await job.run(createStoragePurgeOperation(scope), client)
  if (status?.state === 'failed') throw new Error(status.error?.message ?? 'The deletion failed.')
  if (status?.state === 'cancelled') throw new Error('The deletion was cancelled.')
}
