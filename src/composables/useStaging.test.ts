import { describe, expect, it, vi } from 'vitest'
import type { ListStagingJobsResponse, StagingJob } from '@/lib/api'

vi.mock('./useAruna', () => ({ useAruna: () => ({ stageBlob: vi.fn() }) }))

const { bucketStagingJobs } = await import('./useStaging')

function job(id: string, bucket: string): StagingJob {
  return {
    job_id: id,
    strategy: 'snapshot',
    group_id: 'g-1',
    connector_id: 'c-1',
    bucket,
    state: 'done',
    phase: 'completed',
    submitted_at: '2026-10-01T00:00:00Z',
    progress: { items_current: 1, bytes_current: 1 },
    errors: [],
  }
}

describe('staging jobs of one bucket', () => {
  it('keeps the jobs of the bucket across pages', async () => {
    const pages: Record<string, ListStagingJobsResponse> = {
      first: { jobs: [job('a', 'reef'), job('b', 'other')], next_cursor: 'c2' },
      c2: { jobs: [job('c', 'reef')] },
    }
    const list = vi.fn(async (cursor?: string) => pages[cursor ?? 'first'])

    const found = await bucketStagingJobs(list, 'reef')

    expect(found.jobs.map((entry) => entry.job_id)).toEqual(['a', 'c'])
    expect(found.truncated).toBe(false)
    expect(list).toHaveBeenCalledWith('c2')
  })

  it('stops after the page limit and says so', async () => {
    const list = vi.fn(async () => ({ jobs: [job('a', 'reef')], next_cursor: 'more' }))

    const found = await bucketStagingJobs(list, 'reef', 2)

    expect(list).toHaveBeenCalledTimes(2)
    expect(found.jobs).toHaveLength(2)
    expect(found.truncated).toBe(true)
  })
})
