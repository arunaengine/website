import { effectScope, nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { ObjectVersionEntry } from '@/lib/objectVersions'

const origins: Record<string, unknown> = {}
// The asked version answers for itself unless a test says otherwise.
const answerFor = async (_bucket: string, query: { key: string; version_id?: string }) =>
  (origins[query.key] ? { ...(origins[query.key] as object), version_id: query.version_id } : null)
const getFileOrigin = vi.fn((bucket: string, query: { key: string; version_id?: string }, _signal?: AbortSignal): Promise<unknown> => answerFor(bucket, query))
const getRun = vi.fn(async (_id: string): Promise<{ run_id: string; logical_job_id: string; run_crate?: string }> => ({ run_id: 'r1', logical_job_id: 't1' }))
const getTask = vi.fn(async (_id: string, _view: string): Promise<{ id: string; name: string }> => ({ id: 't1', name: 'Annotate my genome with Bakta' }))
const sessionEpoch = ref(1)
// The stored versions the folder listing answers with.
const stored: ObjectVersionEntry[] = []
const listFolderVersions = vi.fn(async (_bucket: string, prefix: string): Promise<{ versions: ObjectVersionEntry[]; truncated: boolean }> =>
  ({ versions: stored.filter((entry) => entry.key.startsWith(prefix)), truncated: false }))
vi.mock('@/composables/useAruna', () => ({ useAruna: () => ({ getFileOrigin, getRun, sessionEpoch }) }))
vi.mock('@/composables/useS3', () => ({ useS3: () => ({ listFolderVersions }) }))
vi.mock('@/composables/useTes', () => ({ useTes: () => ({ getTask }) }))
const { useFolderOrigin } = await import('./useFolderOrigin')

const job = (time: string) => ({ created_at: time, created_by: 'u1', projection: [], origin: { kind: 'job', run_id: 'r1' } })
const AT = new Date('2026-10-29T08:00:00Z')
// A listed file whose version the folder listing names.
function file(key: string, etag = '1', at = AT) {
  stored.push({ key, versionId: `v:${key}:${etag}:${at.getTime()}`, isLatest: true, deleteMarker: false, etag, lastModified: at })
  return { key, etag, lastModified: at }
}
const settle = async () => {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
    await nextTick()
  }
}

describe('folder origin', () => {
  it('names a run shared by every file once, with its newest time and a link', async () => {
    Object.assign(origins, { 'a.fna': job('2026-10-29T10:00:00Z'), 'b.faa': job('2026-10-29T11:00:00Z') })
    const files = ref([file('a.fna'), file('b.faa')])
    const origin = useFolderOrigin(ref('laptop'), ref(null), files)
    await settle()

    expect(origin.shared.value).toEqual({ key: 'job:r1', label: 'Annotate my genome with Bakta', to: { name: 'task', params: { taskId: 't1' } }, time: '2026-10-29T11:00:00Z' })
    expect(origin.mixed.value).toBe(false)
    expect(getRun).toHaveBeenCalledTimes(1)
  })

  it('links the run record once the run names one', async () => {
    getRun.mockImplementationOnce(async () => ({ run_id: 'r-record', logical_job_id: 't1', run_crate: 'doc-1' }))
    const recorded = { ...job('2026-10-29T10:00:00Z'), origin: { kind: 'job', run_id: 'r-record' } }
    Object.assign(origins, { 'records/a.fna': recorded })
    const origin = useFolderOrigin(ref('records'), ref(null), ref([file('records/a.fna')]))
    await settle()

    expect(origin.shared.value?.to).toEqual({ name: 'dataset', params: { id: 'doc-1' } })
  })

  it('names each file when the origins differ', async () => {
    origins['c.tsv'] = { created_at: '2026-10-29T09:00:00Z', created_by: 'u1', projection: [], origin: { kind: 'upload', node_id: 'n1' } }
    const files = ref([{ key: 'a.fna', etag: '1', lastModified: AT }, file('c.tsv')])
    const origin = useFolderOrigin(ref('laptop'), ref(null), files)
    await settle()

    expect(origin.shared.value).toBeNull()
    expect(origin.mixed.value).toBe(true)
    expect(origin.byKey.value.get('c.tsv')?.label).toBe('an upload')
  })

  it('asks nothing for a page of more than 50 files', async () => {
    getFileOrigin.mockClear()
    listFolderVersions.mockClear()
    const files = ref(Array.from({ length: 51 }, (_, index) => ({ key: `f${index}`, etag: '1', lastModified: AT })))
    const origin = useFolderOrigin(ref('big'), ref(null), files)
    await settle()
    expect(getFileOrigin).not.toHaveBeenCalled()
    expect(listFolderVersions).not.toHaveBeenCalled()
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
    const files = ref([file('own.fna', '9')])
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
    const files = ref([file('slow.fna')])
    const first = effectScope()
    first.run(() => useFolderOrigin(ref('slow'), ref(null), files))
    const second = effectScope()
    second.run(() => useFolderOrigin(ref('slow'), ref(null), files))
    await settle()
    // Two views of one page ask once.
    expect(pending.map((entry) => entry.key)).toEqual(['slow.fna'])

    files.value = [{ ...files.value[0] }]
    await settle()
    expect(pending[0].signal?.aborted).toBe(true)
    expect(pending).toHaveLength(2)

    first.stop()
    second.stop()
    expect(pending[1].signal?.aborted).toBe(true)
    getFileOrigin.mockImplementation(answerFor)
  })

  it('asks again for the same bytes uploaded anew', async () => {
    origins['again.tsv'] = job('2026-10-29T08:00:00Z')
    getFileOrigin.mockClear()
    const files = ref([file('again.tsv', 'same')])
    useFolderOrigin(ref('lab'), ref(null), files)
    await settle()
    expect(getFileOrigin).toHaveBeenCalledTimes(1)
    // The same version listed again is not asked twice.
    files.value = [{ ...files.value[0] }]
    await settle()
    expect(getFileOrigin).toHaveBeenCalledTimes(1)
    files.value = [file('again.tsv', 'same', new Date('2026-10-29T09:00:00Z'))]
    await settle()
    expect(getFileOrigin).toHaveBeenCalledTimes(2)
  })

  it('asks for the exact listed version, and leaves an unnamed or doubtful version unknown', async () => {
    origins['exact.tsv'] = job('2026-10-29T08:00:00Z')
    origins['twin.tsv'] = job('2026-10-29T08:00:00Z')
    origins['gone.tsv'] = job('2026-10-29T08:00:00Z')
    getFileOrigin.mockClear()
    const exact = file('exact.tsv')
    // Two versions of the same bytes within one second: which one is listed cannot be told.
    const twin = file('twin.tsv', 'same')
    stored.push({ ...stored.at(-1)!, versionId: 'v:twin:second', lastModified: new Date(AT.getTime() + 300) })
    // Overwritten since the listing: only a newer version is stored.
    const gone = { key: 'gone.tsv', etag: 'old', lastModified: AT }
    file('gone.tsv', 'new', new Date('2026-10-29T08:00:30Z'))
    const origin = useFolderOrigin(ref('pin'), ref(null), ref([exact, twin, gone]))
    await settle()

    expect(getFileOrigin.mock.calls.map((call) => call[1])).toEqual([{ key: 'exact.tsv', version_id: `v:exact.tsv:1:${AT.getTime()}` }])
    expect(origin.byKey.value.has('exact.tsv')).toBe(true)
    expect(origin.byKey.value.has('twin.tsv')).toBe(false)
    expect(origin.byKey.value.has('gone.tsv')).toBe(false)
  })

  it('drops an answer for another version, and asks again once the versions could be listed', async () => {
    origins['other.tsv'] = job('2026-10-29T08:00:00Z')
    getFileOrigin.mockImplementationOnce(async () => ({ ...job('2026-10-29T08:00:00Z'), version_id: 'v:newer' }))
    const origin = useFolderOrigin(ref('pin'), ref(null), ref([file('other.tsv')]))
    await settle()
    expect(origin.byKey.value.has('other.tsv')).toBe(false)

    listFolderVersions.mockRejectedValueOnce(new Error('offline'))
    getFileOrigin.mockClear()
    const files = ref([file('later.tsv')])
    origins['later.tsv'] = job('2026-10-29T08:00:00Z')
    const later = useFolderOrigin(ref('retry'), ref(null), files)
    await settle()
    expect(getFileOrigin).not.toHaveBeenCalled()
    files.value = [{ ...files.value[0] }]
    await settle()
    expect(later.byKey.value.has('later.tsv')).toBe(true)
  })
})
