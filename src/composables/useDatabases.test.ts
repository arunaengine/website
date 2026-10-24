import { effectScope, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type DatabaseView } from '@/lib/api'

const aruna = vi.hoisted(() => ({
  sessionEpoch: { value: 1 },
  authToken: { value: 'token' },
  listDatabases: vi.fn(),
}))
vi.mock('@/composables/useAruna', () => ({ useAruna: () => aruna }))
vi.mock('@/composables/useRealmNodes', () => ({ useRealmNodes: () => ({ localNodeId: ref('n1') }) }))

const { useDatabases } = await import('@/composables/useDatabases')

function view(bucket: string, extra: Partial<DatabaseView> = {}): DatabaseView {
  return {
    entry_id: `e-${bucket}`,
    dataset_id: `d-${bucket}`,
    owner_group: 'g1',
    target: { kind: 'ordinary', node_id: 'n1', bucket },
    bucket,
    state: 'active',
    public: false,
    title: `${bucket} database`,
    ...extra,
  }
}

function start() {
  const scope = effectScope()
  return { databases: scope.run(() => useDatabases())!, scope }
}

describe('databases', () => {
  beforeEach(() => {
    aruna.sessionEpoch.value += 1
    aruna.authToken.value = 'token'
    aruna.listDatabases.mockReset()
  })

  it('reads every page up to the end and finds the database of a bucket', async () => {
    aruna.listDatabases.mockResolvedValueOnce({ databases: [view('lab')], next_after: 'e-lab' })
    aruna.listDatabases.mockResolvedValueOnce({ databases: [view('spire')] })
    const { databases, scope } = start()
    databases.ensure()
    await vi.waitFor(() => expect(databases.state.value).toBe('ready'))

    expect(aruna.listDatabases).toHaveBeenNthCalledWith(2, { limit: 100, after: 'e-lab' })
    expect(databases.rows.value.map((row) => row.bucket)).toEqual(['lab', 'spire'])
    expect(databases.complete.value).toBe(true)
    expect(databases.find('lab', null)?.title).toBe('lab database')
    expect(databases.find('lab', 'n2')).toBeUndefined()
    scope.stop()
  })

  it('says when the list is partial, and keeps a failure apart from an empty list', async () => {
    aruna.listDatabases.mockResolvedValue({ databases: [view('lab')], next_after: 'more' })
    const first = start()
    first.databases.ensure()
    await vi.waitFor(() => expect(first.databases.state.value).toBe('ready'))
    expect(first.databases.complete.value).toBe(false)
    first.scope.stop()

    aruna.sessionEpoch.value += 1
    aruna.listDatabases.mockRejectedValue(new ApiError(503, 'configuration unreadable'))
    const second = start()
    second.databases.ensure()
    await vi.waitFor(() => expect(second.databases.state.value).toBe('failed'))
    expect(second.databases.error.value).toBe('configuration unreadable')
    expect(second.databases.rows.value).toEqual([])
    second.scope.stop()
  })

  it('does not show the list of the session before', async () => {
    aruna.listDatabases.mockResolvedValue({ databases: [view('lab')] })
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

    expect(aruna.listDatabases).not.toHaveBeenCalled()
    expect(databases.state.value).toBe('idle')
    scope.stop()
  })

  it('searches the loaded titles and buckets', async () => {
    aruna.listDatabases.mockResolvedValue({ databases: [view('spire', { title: 'SPIRE microbiome' }), view('refseq')] })
    const { databases, scope } = start()
    databases.ensure()
    await vi.waitFor(() => expect(databases.state.value).toBe('ready'))

    expect(databases.search('microbiome').map((row) => row.bucket)).toEqual(['spire'])
    scope.stop()
  })
})
