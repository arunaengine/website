import { effectScope, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  createStagingJob: vi.fn(async () => ({ job_id: 'job-1' })),
  getStagingJob: vi.fn(async () => ({ job_id: 'job-1', state: 'done', items: [] })),
  stageBatch: vi.fn(),
}))
vi.mock('./useAruna', () => ({ useAruna: () => api }))
vi.mock('./useStaging', () => ({ useStaging: () => ({}), stagingErrorMessage: (err: unknown) => String(err) }))
vi.mock('./useUploadQueue', () => ({ useUploadQueue: () => ({ items: ref([]) }) }))
vi.mock('@/lib/config', () => ({ portalConfig: () => ({ features: {} }) }))

import { useBuilderBasket } from './useBuilderBasket'

describe('connector staging', () => {
  it('starts and follows the job on the node chosen when the batch started', async () => {
    const nodeId = ref<string | null>('node-b')
    const scope = effectScope()
    const basket = scope.run(() =>
      useBuilderBasket({ bucket: ref('reads'), prefix: ref(''), groupId: ref('group-1'), nodeId }),
    )!
    basket.addStaging('connector', [
      { source: 'runs/a.fastq', strategy: 'reference', groupId: 'group-1', connectorId: 'conn-1', connectorName: 'NCBI' },
    ] as never)

    const submitted = basket.submit()
    nodeId.value = 'node-c'
    await submitted

    expect(api.createStagingJob).toHaveBeenCalledWith(expect.objectContaining({ bucket: 'reads' }), 'node-b')
    expect(api.getStagingJob).toHaveBeenCalledWith('job-1', 'node-b')
    scope.stop()
  })
})
