import { effectScope, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const aruna = vi.hoisted(() => ({
  currentUser: { value: null as { id: string } | null },
  nodeInfo: { value: { node: { peer_id: 'n1' } } },
  searchBuckets: vi.fn(),
  listBucketObjects: vi.fn(),
  sessionEpoch: { value: 1 },
}))
vi.mock('@/composables/useAruna', () => ({ useAruna: () => aruna }))
vi.mock('@/composables/useRealmNodes', () => ({ useRealmNodes: () => ({ isTarget: (id: string) => id !== 'device' }) }))

const { publicDownload, usePublicBuckets, usePublicFolder } = await import('./usePublicData')

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
const hit = (bucket: string, node: string, set: string | null = null) => ({ arn: '', bucket, node_id: node, group_id: 'g', created_at: '', set_id: set })

beforeEach(() => {
  vi.clearAllMocks()
  aruna.currentUser.value = null
  aruna.sessionEpoch.value++
})

describe('usePublicBuckets', () => {
  it('reads every page and lists a distributed bucket once with all its nodes', async () => {
    aruna.searchBuckets
      .mockResolvedValueOnce({ hits: [hit('refseq', 'n2', 's1'), hit('ws-01J', 'n2')], next_cursor: 'c2' })
      .mockResolvedValueOnce({ hits: [hit('refseq', 'n3', 's1'), hit('bakta', 'n2'), hit('mine', 'device')], next_cursor: null })
    const scope = effectScope()
    const state = scope.run(() => usePublicBuckets())!
    await settle()

    expect(aruna.searchBuckets).toHaveBeenNthCalledWith(1, '', { limit: 50, cursor: undefined })
    expect(aruna.searchBuckets).toHaveBeenNthCalledWith(2, '', { limit: 50, cursor: 'c2' })
    expect(state.buckets.value.map((row) => [row.bucket, row.nodes])).toEqual([['refseq', ['n2', 'n3']], ['bakta', ['n2']]])
    expect(state.loading.value).toBe(false)
    scope.stop()
  })

  it('never asks for a session, and stops on a repeated cursor', async () => {
    aruna.currentUser.value = { id: 'u1' }
    const scope = effectScope()
    scope.run(() => usePublicBuckets())
    await settle()
    expect(aruna.searchBuckets).not.toHaveBeenCalled()
    scope.stop()

    aruna.currentUser.value = null
    aruna.searchBuckets.mockResolvedValue({ hits: [], next_cursor: 'same' })
    const again = effectScope()
    again.run(() => usePublicBuckets())
    await settle()
    expect(aruna.searchBuckets).toHaveBeenCalledTimes(2)
    again.stop()
  })

  it('keeps the nodes that did not answer a page', async () => {
    aruna.searchBuckets
      .mockResolvedValueOnce({ hits: [hit('bakta', 'n2')], nodes_failed: 1, failed_nodes: ['n3'], next_cursor: 'c2' })
      .mockResolvedValueOnce({ hits: [], nodes_failed: 0, failed_nodes: [], next_cursor: null })
    const scope = effectScope()
    const state = scope.run(() => usePublicBuckets())!
    await settle()
    expect(state.failedNodes.value).toBe(1)
    scope.stop()
  })

  it('shows the failure instead of an empty list', async () => {
    aruna.searchBuckets.mockRejectedValue(new Error('Not authorized'))
    const scope = effectScope()
    const state = scope.run(() => usePublicBuckets())!
    await settle()
    expect(state.error.value).toBe('Not authorized')
    scope.stop()
  })
})

describe('usePublicFolder', () => {
  it('lists one folder on the holder node and pages with the node cursor', async () => {
    aruna.listBucketObjects
      .mockResolvedValueOnce({ bucket: 'b', prefixes: ['db/x/'], objects: [{ key: 'db/', version_id: 'm' }, { key: 'db/a.txt', version_id: 'v1', size: 3, last_modified: 't' }], next_cursor: 'k2' })
      .mockResolvedValueOnce({ bucket: 'b', prefixes: [], objects: [{ key: 'db/b.txt', version_id: 'v2' }], next_cursor: null })
      .mockResolvedValueOnce({ bucket: 'b', prefixes: ['db/x/'], objects: [], next_cursor: 'k2' })
    const scope = effectScope()
    const state = scope.run(() => usePublicFolder(ref('b'), ref('db/'), ref('n2'), ref(25)))!
    await settle()

    expect(aruna.listBucketObjects).toHaveBeenLastCalledWith('b', { prefix: 'db/', delimiter: '/', cursor: undefined, limit: 25 }, 'n2')
    expect(state.folders.value).toEqual([{ prefix: 'db/x/', name: 'x' }])
    expect(state.files.value.map((file) => [file.name, file.versionId])).toEqual([['a.txt', 'v1']])

    state.nextPage()
    await settle()
    expect(aruna.listBucketObjects).toHaveBeenLastCalledWith('b', { prefix: 'db/', delimiter: '/', cursor: 'k2', limit: 25 }, 'n2')
    expect(state.page.value).toBe(2)
    expect(state.nextCursor.value).toBeNull()

    state.previousPage()
    await settle()
    expect(aruna.listBucketObjects).toHaveBeenLastCalledWith('b', { prefix: 'db/', delimiter: '/', cursor: undefined, limit: 25 }, 'n2')
    scope.stop()
  })

  it('drops the answer of a folder left before it arrived', async () => {
    let finish: (value: unknown) => void = () => {}
    aruna.listBucketObjects
      .mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
      .mockResolvedValueOnce({ bucket: 'b', prefixes: [], objects: [{ key: 'new.txt', version_id: 'v' }], next_cursor: null })
    const prefix = ref('old/')
    const scope = effectScope()
    const state = scope.run(() => usePublicFolder(ref('b'), prefix, ref(null), ref(25)))!
    prefix.value = ''
    await nextTick()
    await settle()
    finish({ bucket: 'b', prefixes: [], objects: [{ key: 'old/stale.txt', version_id: 'v' }], next_cursor: null })
    await settle()
    expect(state.files.value.map((file) => file.key)).toEqual(['new.txt'])
    scope.stop()
  })
})

describe('usePublicFolder refusals', () => {
  it('marks a refused or unknown bucket as not readable, unlike other failures', async () => {
    const { ApiError } = await import('@/lib/api')
    aruna.listBucketObjects.mockRejectedValueOnce(new ApiError(401, 'Not authorized'))
    const scope = effectScope()
    const state = scope.run(() => usePublicFolder(ref('private'), ref(''), ref(null), ref(25)))!
    await settle()
    expect(state.denied.value).toBe(true)
    scope.stop()

    aruna.listBucketObjects.mockRejectedValueOnce(new ApiError(503, 'Unavailable'))
    const other = effectScope()
    const failed = other.run(() => usePublicFolder(ref('b'), ref(''), ref(null), ref(25)))!
    await settle()
    expect(failed.denied.value).toBe(false)
    expect(failed.error.value).toBeTruthy()
    other.stop()
  })
})

describe('publicDownload', () => {
  it('names the file on the node S3 endpoint with each path part encoded', () => {
    expect(publicDownload('https://s3.n2.test/', 'b', 'db/a b#1.txt')).toBe('https://s3.n2.test/b/db/a%20b%231.txt')
  })

  it('offers no download for an endpoint that is not HTTP(S)', () => {
    expect(publicDownload('javascript:alert(1)//x', 'b', 'a.txt')).toBeNull()
  })
})
