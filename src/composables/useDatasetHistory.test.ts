import { effectScope, nextTick, reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatasetBranch, DatasetVersion } from '@/lib/api'

const sessionEpoch = ref(0)
const route = reactive({ query: {} as Record<string, string> })
const listBranches = vi.fn()
const listTags = vi.fn()
const listConflicts = vi.fn()
const listVersions = vi.fn()
const resolveUsers = vi.fn()

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ replace: ({ query }: { query: Record<string, string> }) => (route.query = query) }),
}))
vi.mock('@/composables/useAruna', () => ({
  useAruna: () => ({ apiBaseUrl: ref('https://api.test'), authToken: ref('bearer'), sessionEpoch }),
}))
vi.mock('@/composables/useUserDirectory', () => ({
  useUserDirectory: () => ({ resolveUsers, cachedUser: (id: string) => (id === 'u1' ? { user_id: 'u1', name: 'Ada Lovelace' } : null) }),
}))
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  listBranches,
  listTags,
  listConflicts,
  listVersions,
}))

const { ApiError } = await import('@/lib/api')
const { useDatasetHistory } = await import('./useDatasetHistory')

function version(id: string, userId: string | null = null): DatasetVersion {
  return {
    version: id.padEnd(40, '0'),
    parents: [],
    created_at: '2026-09-25T10:00:00Z',
    author: { name: 'Aruna', email: 'git@aruna.local', user_id: userId },
    message: id,
    signed: false,
    branches: [],
    tags: [],
  }
}

function branch(name: string, protectedBranch: boolean): DatasetBranch {
  return { name, protected: protectedBranch, version: name, head: version(name) }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => (resolve = done))
  return { promise, resolve }
}

async function settle() {
  for (let round = 0; round < 5; round += 1) await nextTick()
}

function start(documentId = ref('d1')) {
  const scope = effectScope()
  const history = scope.run(() => useDatasetHistory(documentId, () => true, () => true))!
  return { history, documentId }
}

beforeEach(() => {
  sessionEpoch.value = 0
  route.query = {}
  for (const mock of [listBranches, listTags, listConflicts, listVersions, resolveUsers]) mock.mockReset()
  listBranches.mockResolvedValue([branch('main', true), branch('draft/a', false), branch('aruna', true)])
  listTags.mockResolvedValue([])
  listConflicts.mockResolvedValue([])
  resolveUsers.mockResolvedValue([])
})

describe('useDatasetHistory', () => {
  it('lists main in full and a draft without what main shares', async () => {
    listVersions.mockResolvedValue({ versions: [version('a')], next_cursor: null })
    const { history } = start()
    await settle()
    expect(listVersions).toHaveBeenLastCalledWith('d1', { branch: 'main', since: undefined, limit: 50 }, expect.anything())
    history.branch.value = 'draft/a'
    await settle()
    expect(listVersions).toHaveBeenLastCalledWith('d1', { branch: 'draft/a', since: 'main', limit: 50 }, expect.anything())
  })

  it('drops a version page that answers for the previous document', async () => {
    const late = deferred<{ versions: DatasetVersion[] }>()
    listVersions.mockReturnValueOnce(late.promise).mockResolvedValue({ versions: [version('b')] })
    const { history, documentId } = start()
    await settle()
    documentId.value = 'd2'
    await settle()
    late.resolve({ versions: [version('a')] })
    await settle()
    expect(history.versions.value?.map((entry) => entry.message)).toEqual(['b'])
  })

  it('resolves node-made authors once per page', async () => {
    listVersions.mockResolvedValue({ versions: [version('a', 'u1'), version('b', 'u1'), version('c')] })
    const { history } = start()
    await settle()
    expect(resolveUsers).toHaveBeenCalledTimes(1)
    expect(resolveUsers).toHaveBeenCalledWith(['u1', 'u1'])
    expect(history.versions.value?.map(history.author)).toEqual(['Ada Lovelace', 'Ada Lovelace', 'Aruna'])
  })

  it('tells an older node apart from a dataset without versions', async () => {
    listBranches.mockRejectedValueOnce(new ApiError(404, 'Not Found'))
    const older = start()
    await settle()
    expect(older.history.supported.value).toBe(false)

    listVersions.mockRejectedValue(new ApiError(404, 'no versions', 'branch_missing'))
    const fresh = start(ref('d3'))
    await settle()
    expect(fresh.history.supported.value).toBe(true)
    expect(fresh.history.state.value).toBe('missing')
  })

  it('falls back to main when the branch in the url is gone', async () => {
    route.query = { branch: 'draft/old' }
    listVersions.mockResolvedValue({ versions: [] })
    const { history } = start()
    await settle()
    expect(history.branch.value).toBe('main')
  })
})
