import { describe, expect, it } from 'vitest'
import {
  TES_EXECUTOR_KIND_TAG,
  TES_GROUP_TAG,
  TES_JOB_ID_TAG,
  TES_LOGICAL_STATE_TAG,
  TES_TRANSFER_BYTES_TAG,
  pruneTesTask,
  tesPlacementLike,
  tesPlacementTags,
} from './tes'
import { placementVerdict } from './jobs'

describe('read-only placement tags', () => {
  it('reads every served tag', () => {
    const placement = tesPlacementTags({
      [TES_JOB_ID_TAG]: '01JOB',
      [TES_LOGICAL_STATE_TAG]: 'running',
      [TES_EXECUTOR_KIND_TAG]: 'docker',
      [TES_TRANSFER_BYTES_TAG]: '4194304',
    })

    expect(placement).toEqual({
      jobId: '01JOB',
      logicalState: 'running',
      executorKind: 'docker',
      estimatedTransferBytes: 4194304,
    })
    expect(placementVerdict(tesPlacementLike(placement)).verdict).toBe('data-to-compute')
  })

  it('returns nothing when the node serves no such tags', () => {
    expect(tesPlacementTags(undefined)).toEqual({
      jobId: undefined,
      logicalState: undefined,
      executorKind: undefined,
      estimatedTransferBytes: undefined,
    })
    expect(tesPlacementLike(tesPlacementTags({}))).toBeNull()
  })

  it('drops a transfer estimate that is not a plain decimal', () => {
    // A malformed value must not become a zero, which would read as locality.
    for (const raw of ['-1', '1.5', 'lots', '', '9007199254740993']) {
      expect(tesPlacementTags({ [TES_TRANSFER_BYTES_TAG]: raw }).estimatedTransferBytes).toBeUndefined()
    }
  })

  it('needs both halves before it names a verdict', () => {
    expect(tesPlacementLike(tesPlacementTags({ [TES_EXECUTOR_KIND_TAG]: 'docker' }))).toBeNull()
    expect(tesPlacementLike(tesPlacementTags({ [TES_TRANSFER_BYTES_TAG]: '0' }))).toBeNull()
    expect(
      tesPlacementLike(
        tesPlacementTags({ [TES_EXECUTOR_KIND_TAG]: 'docker', [TES_TRANSFER_BYTES_TAG]: '0' }),
      ),
    ).toEqual({ executor_kind: 'docker', estimated_transfer_bytes: 0 })
  })

  it('strips the read-only tags from a submitted task', () => {
    // A re-run prefill copies them off a fetched task and they are rejected.
    const task = pruneTesTask({
      executors: [{ image: 'alpine', command: ['echo'] }],
      tags: {
        [TES_GROUP_TAG]: 'group',
        [TES_JOB_ID_TAG]: '01JOB',
        [TES_LOGICAL_STATE_TAG]: 'succeeded',
        [TES_EXECUTOR_KIND_TAG]: 'docker',
        [TES_TRANSFER_BYTES_TAG]: '0',
      },
    })

    expect(task.tags).toEqual({ [TES_GROUP_TAG]: 'group' })
  })

  it('omits tags entirely when only read-only ones were set', () => {
    const task = pruneTesTask({
      executors: [{ image: 'alpine', command: ['echo'] }],
      tags: { [TES_JOB_ID_TAG]: '01JOB' },
    })

    expect(task.tags).toBeUndefined()
  })
})
