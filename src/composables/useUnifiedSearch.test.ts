import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useUnifiedSearch } from './useUnifiedSearch'

const mocks = vi.hoisted(() => ({ searchUnified: vi.fn(), searchObjects: vi.fn() }))

vi.mock('@/composables/useAruna', async () => {
  const { ref } = await import('vue')
  return {
    useAruna: () => ({
      searchUnified: mocks.searchUnified,
      searchObjects: mocks.searchObjects,
      authToken: ref('token'),
      apiBaseUrl: ref('/api/v1'),
    }),
  }
})

afterEach(() => {
  mocks.searchUnified.mockReset()
  mocks.searchObjects.mockReset()
  vi.restoreAllMocks()
})

describe('unified document coverage', () => {
  it('propagates truncated from the documents section', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.searchUnified.mockResolvedValueOnce({
      documents: {
        hits: [{
          document_id: 'doc-1',
          group_id: 'group-1',
          document_path: 'datasets/one',
          graph_iri: 'urn:doc-1',
          subject_iri: 'urn:subject-1',
          score: 1,
          title: 'One',
        }],
        next_cursor: null,
        nodes_queried: 2,
        nodes_failed: 0,
        truncated: true,
      },
    })

    const search = useUnifiedSearch(ref('one'), { types: ['documents'] })
    await vi.waitFor(() => expect(search.searched.value).toBe(true))

    expect(search.truncated.value).toBe(true)
    expect(search.partial.value).toBe(true)
    expect(search.complete.value).toBe(false)
    expect(search.requestMs.value).not.toBeNull()
  })

  it('keeps typed partial object coverage with the returned live heads', async () => {
    mocks.searchObjects.mockResolvedValueOnce({
      hits: [{
        kind: 'object',
        mode: 'distributed_best_effort',
        issuer_node_id: 'node-a',
        group_id: 'group-a',
        bucket: 'raw-data',
        key: 'reads/sample.fastq',
      }],
      next_cursor: 'next',
      coverage: {
        scope: 'realm',
        mode: 'distributed_best_effort',
        index_freshness: { source: 'live_heads', as_of: '2026-08-19T09:00:00Z' },
        nodes_queried: 3,
        nodes_failed: 1,
        failed_partitions: ['node-c'],
        omitted_partitions: 0,
        complete: false,
        truncated: true,
        partitions: [],
      },
    })

    const search = useUnifiedSearch(ref('sample'), { types: [], includeObjects: true })
    await vi.waitFor(() => expect(search.objectSearched.value).toBe(true))

    expect(mocks.searchObjects).toHaveBeenCalledWith('sample', expect.objectContaining({
      mode: 'distributed_best_effort',
    }))
    expect(search.objects.value[0]?.key).toBe('reads/sample.fastq')
    expect(search.objectCoverage.value?.scope).toBe('realm')
    expect(search.partial.value).toBe(true)
  })

  it('asks for buckets by default and marks failed bucket nodes partial', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const hit = (bucket: string, node_id: string) => ({
      arn: `arn:${node_id}:${bucket}`,
      bucket,
      node_id,
      group_id: 'group-t',
      group_name: 'test',
      created_at: '2026-10-24T13:58:44Z',
    })
    mocks.searchUnified.mockResolvedValueOnce({
      buckets: {
        hits: [hit('test', 'node-a'), hit('test', 'node-b'), hit('ws-test', 'node-a')],
        nodes_queried: 4,
        nodes_failed: 1,
        failed_nodes: ['node-c'],
      },
    })

    const search = useUnifiedSearch(ref('test'))
    await vi.waitFor(() => expect(search.searched.value).toBe(true))

    expect(mocks.searchUnified).toHaveBeenCalledWith('test', expect.objectContaining({
      types: expect.arrayContaining(['buckets']),
    }))
    expect(search.buckets.value.map((bucket) => bucket.node_id)).toEqual(['node-a', 'node-b'])
    expect(search.empty.value).toBe(false)
    expect(search.partial.value).toBe(true)
  })

  it('does not downgrade a failed strict object search', async () => {
    mocks.searchObjects.mockRejectedValueOnce(new Error('Strict coverage unavailable'))
    const mode = ref<'distributed_strict'>('distributed_strict')

    const search = useUnifiedSearch(ref('sample'), {
      types: [],
      includeObjects: true,
      objectMode: mode,
    })
    await vi.waitFor(() => expect(search.objectSearched.value).toBe(true))

    expect(mocks.searchObjects).toHaveBeenCalledOnce()
    expect(mocks.searchObjects).toHaveBeenCalledWith('sample', expect.objectContaining({
      mode: 'distributed_strict',
    }))
    expect(search.objects.value).toEqual([])
    expect(search.objectCoverage.value).toBeNull()
    expect(search.objectError.value).toBe('Strict coverage unavailable')
  })
})
