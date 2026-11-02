import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { useUnifiedSearch } from './useUnifiedSearch'

const mocks = vi.hoisted(() => ({ searchUnified: vi.fn(), searchObjects: vi.fn(), searchMetadata: vi.fn() }))

vi.mock('@/composables/useAruna', async () => {
  const { ref } = await import('vue')
  return {
    useAruna: () => ({
      searchUnified: mocks.searchUnified,
      // The metadata search has its own mock, so the name search keeps its call order.
      searchObjects: (term: string, options: { match?: string }) =>
        (options.match === 'metadata' ? mocks.searchMetadata : mocks.searchObjects)(term, options),
      authToken: ref('token'),
      apiBaseUrl: ref('/api/v1'),
    }),
  }
})

afterEach(() => {
  mocks.searchUnified.mockReset()
  mocks.searchObjects.mockReset()
  mocks.searchMetadata.mockReset()
  vi.restoreAllMocks()
})

beforeEach(() => {
  const coverage = { scope: 'realm', mode: 'distributed_best_effort', complete: true, truncated: false, partitions: [] }
  mocks.searchMetadata.mockResolvedValue({ hits: [], next_cursor: null, coverage })
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

  it('follows an empty object page with a cursor until a hit arrives', async () => {
    const coverage = { scope: 'realm', mode: 'distributed_best_effort', complete: false, truncated: true, partitions: [] }
    const hit = { kind: 'object', issuer_node_id: 'node-a', group_id: 'group-a', bucket: 'raw-data', key: 'reads/late.fastq' }
    let answer: (value: unknown) => void = () => undefined
    mocks.searchObjects
      .mockResolvedValueOnce({ hits: [], next_cursor: 'c2', coverage })
      .mockReturnValueOnce(new Promise((resolve) => { answer = resolve }))

    const search = useUnifiedSearch(ref('late'), { types: [], includeObjects: true })
    await vi.waitFor(() => expect(mocks.searchObjects).toHaveBeenCalledTimes(2))
    expect(mocks.searchObjects).toHaveBeenLastCalledWith('late', expect.objectContaining({ cursor: 'c2' }))
    expect(search.pending.value).toBe(true)

    answer({ hits: [hit], next_cursor: 'c3', coverage })
    await vi.waitFor(() => expect(search.pending.value).toBe(false))
    expect(search.objects.value.map((object) => object.key)).toEqual(['reads/late.fastq'])
    expect(search.objectCursor.value).toBe('c3')
    expect(mocks.searchObjects).toHaveBeenCalledTimes(2)
  })

  it('follows empty object pages after Show more until a hit arrives', async () => {
    const coverage = { scope: 'realm', mode: 'distributed_best_effort', complete: false, truncated: true, partitions: [] }
    const hit = (key: string) => ({ kind: 'object', issuer_node_id: 'node-a', group_id: 'group-a', bucket: 'raw-data', key })
    mocks.searchObjects
      .mockResolvedValueOnce({ hits: [hit('a.fastq')], next_cursor: 'c2', coverage })
      .mockResolvedValueOnce({ hits: [], next_cursor: 'c3', coverage })
      .mockResolvedValueOnce({ hits: [hit('b.fastq')], next_cursor: null, coverage })

    const search = useUnifiedSearch(ref('reads'), { types: [], includeObjects: true })
    await vi.waitFor(() => expect(search.pending.value).toBe(false))
    await search.loadMore('objects')

    expect(mocks.searchObjects).toHaveBeenLastCalledWith('reads', expect.objectContaining({ cursor: 'c3' }))
    expect(search.objects.value.map((object) => object.key)).toEqual(['a.fastq', 'b.fastq'])
    expect(search.objectCursor.value).toBeNull()
  })

  it('stops following empty object pages on cancel and searches again on retry', async () => {
    const coverage = { scope: 'realm', mode: 'distributed_best_effort', complete: false, truncated: true, partitions: [] }
    // Each page answers on a later turn, like a request over the network.
    mocks.searchObjects.mockImplementation((_term: string, options: { cursor?: string }) =>
      new Promise((resolve) => setTimeout(() => resolve({ hits: [], next_cursor: `${options.cursor ?? ''}x`, coverage }), 0)))

    const search = useUnifiedSearch(ref('rare'), { types: [], includeObjects: true })
    await vi.waitFor(() => expect(mocks.searchObjects.mock.calls.length).toBeGreaterThan(2))
    search.cancel()
    const calls = mocks.searchObjects.mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, 5))

    expect(mocks.searchObjects).toHaveBeenCalledTimes(calls)
    expect(search.pending.value).toBe(false)
    expect(search.searched.value).toBe(false)
    expect(search.objects.value).toEqual([])

    mocks.searchObjects.mockResolvedValue({ hits: [{ kind: 'object', issuer_node_id: 'node-a', group_id: 'group-a', bucket: 'raw-data', key: 'rare.txt' }], next_cursor: null, coverage })
    search.retry()
    await vi.waitFor(() => expect(search.objects.value.map((object) => object.key)).toEqual(['rare.txt']))
  })

  it('finds files by their searchable metadata as well as by name, each paging on its own', async () => {
    const coverage = { scope: 'realm', mode: 'distributed_best_effort', complete: true, truncated: false, partitions: [] }
    const hit = (key: string) => ({ kind: 'object', issuer_node_id: 'node-2', group_id: 'group-a', bucket: 'ncbi-refseq', key })
    mocks.searchObjects.mockResolvedValueOnce({ hits: [hit('coli/a.fna')], next_cursor: null, coverage })
    mocks.searchMetadata
      .mockResolvedValueOnce({ hits: [hit('coli/a.fna'), hit('coli/b.fna')], next_cursor: 'm2', coverage })
      .mockResolvedValueOnce({ hits: [hit('coli/c.fna')], next_cursor: null, coverage })

    const search = useUnifiedSearch(ref('Escherichia coli'), { types: [], includeObjects: true })
    await vi.waitFor(() => expect(search.objectSearched.value).toBe(true))
    expect(mocks.searchMetadata).toHaveBeenCalledWith('Escherichia coli', expect.objectContaining({ match: 'metadata' }))
    expect(search.objects.value.map((object) => object.key)).toEqual(['coli/a.fna', 'coli/b.fna'])
    expect(search.objectCursor.value).toBe('m2')

    await search.loadMore('objects')
    expect(mocks.searchObjects).toHaveBeenCalledOnce()
    expect(mocks.searchMetadata).toHaveBeenLastCalledWith('Escherichia coli', expect.objectContaining({ match: 'metadata', cursor: 'm2' }))
    expect(search.objects.value.map((object) => object.key)).toEqual(['coli/a.fna', 'coli/b.fna', 'coli/c.fna'])
    expect(search.objectCursor.value).toBeNull()
  })

  it('counts a full answer with more pages as complete, and a partial metadata answer as partial', async () => {
    const paged = { scope: 'realm', mode: 'distributed_best_effort', complete: true, truncated: true, partitions: [] }
    const hit = (key: string) => ({ kind: 'object', issuer_node_id: 'node-2', group_id: 'group-a', bucket: 'ncbi-refseq', key })
    mocks.searchObjects.mockResolvedValue({ hits: [hit('coli/a.fna')], next_cursor: 'n2', coverage: paged })
    mocks.searchMetadata.mockResolvedValueOnce({ hits: [hit('coli/b.fna')], next_cursor: 'm2', coverage: paged })

    const search = useUnifiedSearch(ref('Escherichia coli'), { types: [], includeObjects: true })
    await vi.waitFor(() => expect(search.objectSearched.value).toBe(true))
    expect(search.objectCursor.value).not.toBeNull()
    expect(search.partial.value).toBe(false)

    mocks.searchMetadata.mockResolvedValueOnce({ hits: [hit('coli/c.fna')], next_cursor: null, coverage: { ...paged, complete: false } })
    search.retry()
    await vi.waitFor(() => expect(search.objects.value.map((object) => object.key)).toContain('coli/c.fna'))
    expect(search.partial.value).toBe(true)
  })

  it('keeps the name hits when the node refuses the metadata search', async () => {
    const coverage = { scope: 'realm', mode: 'distributed_best_effort', complete: true, truncated: false, partitions: [] }
    mocks.searchObjects.mockResolvedValueOnce({ hits: [{ kind: 'object', issuer_node_id: 'node-a', group_id: 'g', bucket: 'b', key: 'SAMD1.fna' }], next_cursor: null, coverage })
    mocks.searchMetadata.mockRejectedValueOnce(new Error('unknown match'))

    const search = useUnifiedSearch(ref('SAMD1'), { types: [], includeObjects: true })
    await vi.waitFor(() => expect(search.objectSearched.value).toBe(true))
    expect(search.objects.value.map((object) => object.key)).toEqual(['SAMD1.fna'])
    expect(search.objectError.value).toBeNull()
    expect(search.partial.value).toBe(true)
    expect(search.objectCoverage.value?.complete).toBe(false)
  })

  it('keeps a partial metadata answer and its pages through later name pages', async () => {
    const full = { scope: 'realm', mode: 'distributed_best_effort', complete: true, truncated: false, partitions: [] }
    const hit = (key: string) => ({ kind: 'object', issuer_node_id: 'node-2', group_id: 'group-a', bucket: 'b', key })
    mocks.searchObjects
      .mockResolvedValueOnce({ hits: [hit('a.fna')], next_cursor: 'n2', coverage: { ...full, truncated: true } })
      .mockResolvedValueOnce({ hits: [hit('b.fna')], next_cursor: null, coverage: full })
    mocks.searchMetadata.mockResolvedValueOnce({ hits: [hit('c.fna')], next_cursor: 'm2', coverage: { ...full, complete: false } })

    const search = useUnifiedSearch(ref('coli'), { types: [], includeObjects: true })
    await vi.waitFor(() => expect(search.objectSearched.value).toBe(true))
    mocks.searchMetadata.mockResolvedValueOnce({ hits: [], next_cursor: 'm3', coverage: full })
    await search.loadMore('objects')

    expect(search.partial.value).toBe(true)
    expect(search.objectCoverage.value).toMatchObject({ complete: false, truncated: true })
  })

  it('schedules no search for a change while it is not active', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('window', globalThis)
    try {
      mocks.searchUnified.mockResolvedValue({})
      const query = ref('one')
      const active = ref(false)
      useUnifiedSearch(query, { types: ['documents'], active })
      query.value = 'two'
      await nextTick()
      vi.advanceTimersByTime(5_000)
      expect(mocks.searchUnified).not.toHaveBeenCalled()

      active.value = true
      query.value = 'three'
      await nextTick()
      vi.advanceTimersByTime(5_000)
      expect(mocks.searchUnified).toHaveBeenCalledOnce()
    } finally {
      vi.unstubAllGlobals()
      vi.useRealTimers()
    }
  })
})
