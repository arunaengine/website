import { effectScope, nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

const origins: Record<string, unknown> = {}
const getFileOrigin = vi.fn(async (_bucket: string, query: { key: string }, _signal?: AbortSignal) => origins[query.key] ?? null)
const getRun = vi.fn(async (_id: string): Promise<{ run_id: string; logical_job_id: string }> => ({ run_id: 'r1', logical_job_id: 't1' }))
const getTask = vi.fn(async (_id: string, _view: string): Promise<{ id: string; name: string }> => ({ id: 't1', name: 'Annotate my genome with Bakta' }))
const sessionEpoch = ref(1)
vi.mock('@/composables/useAruna', () => ({ useAruna: () => ({ getFileOrigin, getRun, sessionEpoch }) }))
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

  it('keeps the run name of an old account out of the next session', async () => {
    // Views of earlier tests stay mounted and read their own runs, so only r9 is followed.
    const answers: ((value: { run_id: string; logical_job_id: string }) => void)[] = []
    getRun.mockImplementation((id: string) =>
      new Promise((resolve) => (id === 'r9' ? answers.push(resolve) : resolve({ run_id: id, logical_job_id: 't1' }))))
    getTask.mockImplementation(async (id: string) => ({ id, name: id === 'private' ? 'Private run' : 'My run' }))
    // A run no earlier test has named, so both sessions ask for it.
    origins['own.fna'] = { ...job('2026-10-29T12:00:00Z'), origin: { kind: 'job', run_id: 'r9' } }
    const files = ref([{ key: 'own.fna', etag: '9' }])
    const origin = useFolderOrigin(ref('lab'), ref(null), files)
    await settle()
    sessionEpoch.value = 2
    await settle()
    expect(answers).toHaveLength(2)

    answers[1]({ run_id: 'r9', logical_job_id: 'mine' })
    await settle()
    answers[0]({ run_id: 'r9', logical_job_id: 'private' })
    await settle()
    expect(origin.shared.value?.label).toBe('My run')
    expect(getTask).not.toHaveBeenCalledWith('private', 'BASIC')
    getRun.mockImplementation(async () => ({ run_id: 'r1', logical_job_id: 't1' }))
  })

  it('stops the walk on a new listing or when the view goes, and shares reads under way', async () => {
    const pending: { key: string; signal?: AbortSignal; resolve: (value: unknown) => void }[] = []
    getFileOrigin.mockImplementation((_bucket: string, query: { key: string }, signal?: AbortSignal) =>
      new Promise((resolve) => pending.push({ key: query.key, signal, resolve: resolve as (value: unknown) => void })))
    const files = ref([{ key: 'slow.fna', etag: '1' }])
    const first = effectScope()
    first.run(() => useFolderOrigin(ref('slow'), ref(null), files))
    const second = effectScope()
    second.run(() => useFolderOrigin(ref('slow'), ref(null), files))
    await settle()
    // Two views of one page ask once.
    expect(pending.map((entry) => entry.key)).toEqual(['slow.fna'])

    files.value = [{ key: 'slow.fna', etag: '1' }]
    await settle()
    expect(pending[0].signal?.aborted).toBe(true)
    expect(pending).toHaveLength(2)

    first.stop()
    second.stop()
    expect(pending[1].signal?.aborted).toBe(true)
    getFileOrigin.mockImplementation(async (_bucket: string, query: { key: string }) => origins[query.key] ?? null)
  })

  it('asks again for the same bytes uploaded anew', async () => {
    getFileOrigin.mockReset().mockImplementation(async () => job('2026-10-29T08:00:00Z'))
    const files = ref([{ key: 'again.tsv', etag: 'same', lastModified: new Date('2026-10-29T08:00:00Z') }])
    useFolderOrigin(ref('lab'), ref(null), files)
    await settle()
    expect(getFileOrigin).toHaveBeenCalledTimes(1)
    // The same version listed again is not asked twice.
    files.value = [{ key: 'again.tsv', etag: 'same', lastModified: new Date('2026-10-29T08:00:00Z') }]
    await settle()
    expect(getFileOrigin).toHaveBeenCalledTimes(1)
    files.value = [{ key: 'again.tsv', etag: 'same', lastModified: new Date('2026-10-29T09:00:00Z') }]
    await settle()
    expect(getFileOrigin).toHaveBeenCalledTimes(2)
  })

  it('keeps the origin of a newer version out of the listed one', async () => {
    getFileOrigin.mockReset().mockImplementation(async () => job('2026-10-29T10:05:00Z'))
    const listed = new Date('2026-10-29T10:00:00.400Z')
    const files = ref([{ key: 'over.tsv', etag: 'x', lastModified: listed }])
    const origin = useFolderOrigin(ref('pinned'), ref(null), files)
    await settle()
    expect(origin.byKey.value.has('over.tsv')).toBe(false)

    // The listed version itself, its time in whole seconds.
    getFileOrigin.mockImplementation(async () => job('2026-10-29T10:00:00Z'))
    files.value = [{ key: 'over.tsv', etag: 'x', lastModified: listed }]
    await settle()
    expect(origin.byKey.value.get('over.tsv')?.time).toBe('2026-10-29T10:00:00Z')
  })
})
