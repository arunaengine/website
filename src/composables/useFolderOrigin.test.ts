import { nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

const origins: Record<string, unknown> = {}
const getFileOrigin = vi.fn(async (_bucket: string, query: { key: string }) => origins[query.key] ?? null)
const getRun = vi.fn(async () => ({ run_id: 'r1', logical_job_id: 't1' }))
const getTask = vi.fn(async () => ({ id: 't1', name: 'Annotate my genome with Bakta' }))
vi.mock('@/composables/useAruna', () => ({ useAruna: () => ({ getFileOrigin, getRun, sessionEpoch: ref(1) }) }))
vi.mock('@/composables/useTes', () => ({ useTes: () => ({ getTask }) }))
const { useFolderOrigin } = await import('./useFolderOrigin')

const job = (time: string) => ({ created_at: time, created_by: 'u1', projection: [], origin: { kind: 'job', run_id: 'r1' } })
const settle = async () => {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve()
    await nextTick()
  }
}

describe('folder origin', () => {
  it('names a run shared by every file once, with its newest time and a link', async () => {
    Object.assign(origins, { 'a.fna': job('2026-10-29T10:00:00Z'), 'b.faa': job('2026-10-29T11:00:00Z') })
    const files = ref([{ key: 'a.fna', etag: '1' }, { key: 'b.faa', etag: '1' }])
    const origin = useFolderOrigin(ref('laptop'), ref(null), files)
    await settle()

    expect(origin.shared.value).toEqual({ key: 'job:r1', label: 'Annotate my genome with Bakta', to: { name: 'task', params: { taskId: 't1' } }, time: '2026-10-29T11:00:00Z' })
    expect(origin.mixed.value).toBe(false)
    expect(getRun).toHaveBeenCalledTimes(1)
  })

  it('names each file when the origins differ', async () => {
    origins['c.tsv'] = { created_at: '2026-10-29T09:00:00Z', created_by: 'u1', projection: [], origin: { kind: 'upload', node_id: 'n1' } }
    const files = ref([{ key: 'a.fna', etag: '1' }, { key: 'c.tsv', etag: '1' }])
    const origin = useFolderOrigin(ref('laptop'), ref(null), files)
    await settle()

    expect(origin.shared.value).toBeNull()
    expect(origin.mixed.value).toBe(true)
    expect(origin.byKey.value.get('c.tsv')?.label).toBe('an upload')
  })

  it('asks nothing for a page of more than 50 files', async () => {
    getFileOrigin.mockClear()
    const files = ref(Array.from({ length: 51 }, (_, index) => ({ key: `f${index}`, etag: '1' })))
    const origin = useFolderOrigin(ref('big'), ref(null), files)
    await settle()
    expect(getFileOrigin).not.toHaveBeenCalled()
    expect(origin.shared.value).toBeNull()
  })
})
