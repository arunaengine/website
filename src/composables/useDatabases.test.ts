import { effectScope, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type BucketSearchHit } from '@/lib/api'

const aruna = vi.hoisted(() => ({
  sessionEpoch: { value: 1 },
  authToken: { value: 'token' },
  searchBuckets: vi.fn(),
}))
vi.mock('@/composables/useAruna', () => ({ useAruna: () => aruna }))
vi.mock('@/composables/useRealmNodes', () => ({ useRealmNodes: () => ({ localNodeId: ref('n1'), isTarget: (id: string) => id !== 'device-1' }) }))

const { useDatabases } = await import('@/composables/useDatabases')

function view(bucket: string, title = `${bucket} database`): BucketSearchHit {
  return {
    arn: `arn:aruna:r1:n1:s3/${bucket}`, bucket, node_id: 'n1', group_id: 'g1', created_at: '2026-10-28T00:00:00Z',
    metadata: { database: true, title, identifiers: [] }, public: false,
  }
}

const page = (hits: BucketSearchHit[], next_cursor?: string, nodes_failed = 0) =>
  ({ hits, next_cursor, nodes_failed, nodes_queried: 2, failed_nodes: [] })

function start() {
  const scope = effectScope()
  return { databases: scope.run(() => useDatabases())!, scope }
}

describe('databases', () => {
  beforeEach(() => {
    aruna.sessionEpoch.value += 1
    aruna.authToken.value = 'token'
    aruna.searchBuckets.mockReset()
  })

  it('lists no database a device answers for', async () => {
    aruna.searchBuckets.mockResolvedValueOnce(page([view('lab'), { ...view('laptop-db'), node_id: 'device-1' }]))
    const { databases, scope } = start()
    databases.ensure()
    await vi.waitFor(() => expect(databases.state.value).toBe('ready'))

    expect(databases.rows.value.map((row) => row.bucket)).toEqual(['lab'])
    scope.stop()
  })

  it('reads every page up to the end and finds the database of a bucket', async () => {
    aruna.searchBuckets.mockResolvedValueOnce(page([view('lab')], 'c1'))
    aruna.searchBuckets.mockResolvedValueOnce(page([view('spire')]))
    const { databases, scope } = start()
    databases.ensure()
    await vi.waitFor(() => expect(databases.state.value).toBe('ready'))

    expect(aruna.searchBuckets).toHaveBeenNthCalledWith(2, '', { database: true, limit: 50, cursor: 'c1' })
    expect(databases.rows.value.map((row) => row.bucket)).toEqual(['lab', 'spire'])
    expect(databases.complete.value).toBe(true)
    expect(databases.find('lab', null, null)?.title).toBe('lab database')
    expect(databases.find('lab', null)).toBeUndefined()
    expect(databases.find('lab', 'n2')).toBeUndefined()
    expect(databases.find('lab', null, 's1')).toBeUndefined()
    scope.stop()
  })

  it('says when the list is partial, and keeps a failure apart from an empty list', async () => {
    aruna.searchBuckets.mockResolvedValue(page([view('lab')], undefined, 1))
    const first = start()
    first.databases.ensure()
    await vi.waitFor(() => expect(first.databases.state.value).toBe('ready'))
    expect(first.databases.complete.value).toBe(false)
    first.scope.stop()

    aruna.sessionEpoch.value += 1
    aruna.searchBuckets.mockRejectedValue(new ApiError(503, 'configuration unreadable'))
    const second = start()
    second.databases.ensure()
    await vi.waitFor(() => expect(second.databases.state.value).toBe('failed'))
    expect(second.databases.error.value).toBe('configuration unreadable')
    expect(second.databases.rows.value).toEqual([])
    second.scope.stop()
  })

  it('does not show the list of the session before', async () => {
    aruna.searchBuckets.mockResolvedValue(page([view('lab')]))
    const { databases, scope } = start()
    databases.ensure()
    await vi.waitFor(() => expect(databases.state.value).toBe('ready'))
    aruna.sessionEpoch.value += 1

    expect(databases.rows.value).toEqual([])
    scope.stop()
  })

  it('asks nothing without a session', async () => {
    aruna.authToken.value = ''
    const { databases, scope } = start()
    databases.ensure()

    expect(aruna.searchBuckets).not.toHaveBeenCalled()
    expect(databases.state.value).toBe('idle')
    scope.stop()
  })

  it('searches the loaded titles and buckets', async () => {
    aruna.searchBuckets.mockResolvedValue(page([view('spire', 'SPIRE microbiome'), view('refseq')]))
    const { databases, scope } = start()
    databases.ensure()
    await vi.waitFor(() => expect(databases.state.value).toBe('ready'))

    expect(databases.search('microbiome').map((row) => row.bucket)).toEqual(['spire'])
    scope.stop()
  })

  it('starts a new read when the session changed during a read', async () => {
    aruna.searchBuckets.mockImplementationOnce(() => new Promise(() => {}))
    aruna.searchBuckets.mockResolvedValueOnce(page([view('lab')]))
    const { databases, scope } = start()
    databases.ensure()
    aruna.sessionEpoch.value += 1
    databases.ensure()
    await vi.waitFor(() => expect(databases.state.value).toBe('ready'))

    expect(databases.rows.value.map((row) => row.bucket)).toEqual(['lab'])
    scope.stop()
  })

  it('reads every page however many databases there are', async () => {
    aruna.searchBuckets.mockImplementation(async (_q: string, { cursor }: { cursor?: string }) => {
      const at = Number(cursor ?? 0)
      return page([view(`b${at}`)], at < 30 ? String(at + 1) : undefined)
    })
    const { databases, scope } = start()
    databases.ensure()
    await vi.waitFor(() => expect(databases.state.value).toBe('ready'))

    expect(aruna.searchBuckets).toHaveBeenCalledTimes(31)
    expect(databases.rows.value).toHaveLength(31)
    scope.stop()
  })
})
