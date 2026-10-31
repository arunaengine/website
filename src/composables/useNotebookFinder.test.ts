import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const group = ref('g1')
const epoch = ref(0)
const searchBuckets = vi.fn()
const searchObjects = vi.fn()
vi.mock('@/composables/useGroupSelection', () => ({ activeGroupId: group }))
vi.mock('@/composables/useAruna', () => ({ useAruna: () => ({ sessionEpoch: epoch, searchBuckets, searchObjects }) }))
vi.mock('@/composables/useRealmNodes', () => ({
  useRealmNodes: () => ({ isTarget: (id: string) => id !== 'laptop', isLocalNode: (id: string) => id === 'node-1' }),
}))

const { useNotebookFinder } = await import('./useNotebookFinder')

const bucketHit = (bucket: string, node_id: string, set_id?: string) => ({ bucket, node_id, group_id: 'g1', set_id })
const objectHit = (bucket: string, key: string, issuer_node_id: string, updated_at = '2026-10-01T00:00:00Z') =>
  ({ bucket, key, issuer_node_id, group_id: 'g1', updated_at })
const coverage = (complete: boolean, failed: string[] = []) => ({ complete, failed_partitions: failed })

beforeEach(() => {
  searchBuckets.mockReset()
  searchObjects.mockReset()
})

describe('the notebook finder', () => {
  it('finds notebooks on every node from the search, page by page, and names their node', async () => {
    searchBuckets.mockResolvedValue({
      hits: [bucketHit('lab', 'node-1'), bucketHit('far', 'node-2'), bucketHit('down', 'node-3'), bucketHit('shared', 'node-1', 's1'), bucketHit('mine', 'laptop')],
      nodes_failed: 0,
      next_cursor: null,
    })
    searchObjects.mockImplementation(async (_q: string, options: { bucket?: string; cursor?: string }) => {
      if (options.bucket === 'shared') return { hits: [objectHit('shared', 's.ipynb', 'node-1')], coverage: coverage(false) }
      if (!options.cursor) {
        return { hits: [objectHit('lab', 'a.ipynb', 'node-1', '2026-10-03T00:00:00Z'), objectHit('far', 'nb/b.ipynb', 'node-2')], next_cursor: 'p2', coverage: coverage(false, ['node-3']) }
      }
      return { hits: [objectHit('far', 'c.ipynb', 'node-2'), objectHit('mine', 'x.ipynb', 'laptop'), objectHit('lab', 'ipynb-notes.txt', 'node-1')], next_cursor: null, coverage: coverage(false) }
    })
    const finder = useNotebookFinder()
    await finder.load()

    expect(finder.state.value).toBe('ready')
    expect(searchObjects).toHaveBeenCalledWith('ipynb', { bucket: undefined, limit: 100, cursor: 'p2' })
    expect(searchObjects).toHaveBeenCalledWith('ipynb', expect.objectContaining({ bucket: 'shared' }))
    expect(finder.buckets.value).toEqual(['lab', 'far', 'down', 'shared'])
    expect(finder.notebooks.value.map((entry) => [entry.bucket, entry.key, entry.nodeId])).toEqual([
      ['lab', 'a.ipynb', null],
      ['far', 'nb/b.ipynb', 'node-2'],
      ['far', 'c.ipynb', 'node-2'],
      ['shared', 's.ipynb', null],
    ])
    expect(finder.nodes.value.get('far')).toBe('node-2')
    expect(finder.failed.value).toEqual(['down'])
    expect(finder.partial.value).toEqual(['shared'])
  })

  it('drops the answer of a load that a newer one replaced', async () => {
    let release: (value: unknown) => void = () => {}
    searchBuckets
      .mockReturnValueOnce(new Promise((resolve) => (release = resolve)))
      .mockResolvedValueOnce({ hits: [bucketHit('new', 'node-1')], nodes_failed: 0, next_cursor: null })
    searchObjects.mockResolvedValue({ hits: [objectHit('new', 'new.ipynb', 'node-1'), objectHit('old', 'old.ipynb', 'node-1')], next_cursor: null, coverage: coverage(true) })
    const finder = useNotebookFinder()
    const first = finder.load()
    await finder.load()
    release({ hits: [bucketHit('old', 'node-1')], nodes_failed: 0, next_cursor: null })
    await first

    expect(finder.buckets.value).toEqual(['new'])
    expect(finder.notebooks.value.map((entry) => entry.key)).toEqual(['new.ipynb'])
  })
})
