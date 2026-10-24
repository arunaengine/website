import { describe, expect, it } from 'vitest'
import {
  TES_EXECUTOR_KIND_TAG,
  TES_GROUP_TAG,
  TES_JOB_ID_TAG,
  TES_LABEL_TAG_PREFIX,
  TES_LOGICAL_STATE_TAG,
  TES_TRANSFER_BYTES_TAG,
  isLocalRun,
  placementTags,
  pruneTesTask,
  tesPlacementLike,
  tesPlacementTags,
  runListed,
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
      labelConstraints: {},
    })
    expect(placementVerdict(tesPlacementLike(placement)).verdict).toBe('data-to-compute')
  })

  it('returns nothing when the node serves no such tags', () => {
    expect(tesPlacementTags(undefined)).toEqual({
      jobId: undefined,
      logicalState: undefined,
      executorKind: undefined,
      estimatedTransferBytes: undefined,
      labelConstraints: {},
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
        ...placementTags({ region: 'eu-central' }),
      },
    })

    expect(task.tags).toEqual({
      [TES_GROUP_TAG]: 'group',
      [`${TES_LABEL_TAG_PREFIX}region`]: 'eu-central',
    })
  })

  it('omits tags entirely when only read-only ones were set', () => {
    const task = pruneTesTask({
      executors: [{ image: 'alpine', command: ['echo'] }],
      tags: { [TES_JOB_ID_TAG]: '01JOB' },
    })

    expect(task.tags).toBeUndefined()
  })
})

describe('placement label constraints', () => {
  it('prefixes label keys for TES tags and reads them back', () => {
    const labels = {
      'aruna-engine.org/node': 'node-id',
      region: 'eu-central',
    }
    const tags = placementTags(labels)

    expect(tags).toEqual({
      [`${TES_LABEL_TAG_PREFIX}aruna-engine.org/node`]: 'node-id',
      [`${TES_LABEL_TAG_PREFIX}region`]: 'eu-central',
    })
    expect(tesPlacementTags(tags).labelConstraints).toEqual(labels)
  })
})

describe('run list window', () => {
  const now = Date.parse('2026-09-14T12:00:00Z')

  it('lists finished runs of the last 48 hours and hides older ones', () => {
    expect(runListed({ state: 'COMPLETE', creation_time: '2026-09-12T12:00:00Z' }, now)).toBe(true)
    expect(runListed({ state: 'COMPLETE', creation_time: '2026-09-12T11:59:59Z' }, now)).toBe(false)
    expect(runListed({ state: 'UNKNOWN', creation_time: '2026-09-01T00:00:00Z' }, now)).toBe(false)
  })

  it('keeps a run that still works, and one without a start time', () => {
    expect(runListed({ state: 'RUNNING', creation_time: '2026-09-01T00:00:00Z' }, now)).toBe(true)
    expect(runListed({ state: 'CANCELING', creation_time: '2026-09-01T00:00:00Z' }, now)).toBe(true)
    expect(runListed({ state: 'COMPLETE' }, now)).toBe(true)
  })
})

describe('where a run runs', () => {
  it('takes a run without a realm family for one of this computer', () => {
    expect(isLocalRun({ [TES_JOB_ID_TAG]: '01JOB' })).toBe(true)
    expect(isLocalRun({ [TES_JOB_ID_TAG]: '01JOB', [TES_LOGICAL_STATE_TAG]: 'queued' })).toBe(false)
  })

  it('never calls a run local when the node serves no placement tags', () => {
    expect(isLocalRun(undefined)).toBe(false)
    expect(isLocalRun({ [TES_GROUP_TAG]: 'g1' })).toBe(false)
  })
})
