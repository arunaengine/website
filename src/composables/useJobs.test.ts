import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { JobStatusResponse } from '@/lib/jobs'

const listJobs = vi.hoisted(() => vi.fn())
vi.mock('@/lib/config', () => ({ featureEnabled: () => true }))
vi.mock('@/composables/useAruna', () => ({
  useAruna: () => ({ currentUser: ref({ id: 'u1' }), apiBaseUrl: ref('https://n1.test/api/v1'), authToken: ref('t') }),
}))
vi.mock('@/composables/useAuth', () => ({ useAuth: () => ({ authPending: ref(false) }) }))
vi.mock('@/lib/jobs', async (load) => ({ ...(await load<typeof import('@/lib/jobs')>()), listJobs }))
vi.stubGlobal('window', { setInterval: () => 0, clearInterval: () => undefined })

const { useJobsList } = await import('./useJobs')

const job = (id: string, created: string, kind = 'staging') => ({ job_id: id, kind, state: 'succeeded', created_at: created }) as JobStatusResponse

describe('system jobs list', () => {
  it('lists the jobs other nodes run next to the serving node\'s, newest first', async () => {
    listJobs.mockImplementation(async (_params: unknown, client: { baseUrl: string }) => {
      if (client.baseUrl.includes('n2')) return { jobs: [job('import', '2026-11-01T02:00:00Z'), job('pid', '2026-11-01T01:00:00Z')] }
      if (client.baseUrl.includes('n3')) throw new Error('unreachable')
      return { jobs: [job('pid', '2026-11-01T01:00:00Z', 'mint_persistent_id')], next_cursor: 'c1' }
    })
    const list = useJobsList({
      others: () => [{ baseUrl: 'https://n2.test/api/v1', token: 't' }, { baseUrl: 'https://n3.test/api/v1', token: 't' }],
    })
    await list.load()

    expect(list.jobs.value.map((entry) => entry.job_id)).toEqual(['import', 'pid'])
    expect(list.listState.value).toBe('ready')
    expect(list.nextCursor.value).toBe('c1')
  })
})
