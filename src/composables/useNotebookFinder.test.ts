import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const group = ref('g1')
const epoch = ref(0)
const listBuckets = vi.fn()
const listObjectsRecursive = vi.fn()
vi.mock('@/composables/useGroupSelection', () => ({ activeGroupId: group }))
vi.mock('@/composables/useAruna', () => ({ useAruna: () => ({ sessionEpoch: epoch }) }))
vi.mock('@/composables/useS3', () => ({ useS3: () => ({ ensureSession: async () => {}, listBuckets, listObjectsRecursive }) }))

const { useNotebookFinder } = await import('./useNotebookFinder')

beforeEach(() => {
  listBuckets.mockReset()
  listObjectsRecursive.mockReset()
})

describe('the notebook finder', () => {
  it('reports notebooks, partly searched and failed buckets apart', async () => {
    listBuckets.mockResolvedValue([{ name: 'lab' }, { name: 'big' }, { name: 'locked' }])
    listObjectsRecursive.mockImplementation(async (name: string) => {
      if (name === 'locked') throw new Error('locked')
      return { objects: [{ key: `${name}.ipynb` }, { key: 'data.csv' }], truncated: name === 'big' }
    })
    const finder = useNotebookFinder()
    await finder.load()

    expect(finder.state.value).toBe('ready')
    expect(finder.notebooks.value.map((entry) => entry.key).sort()).toEqual(['big.ipynb', 'lab.ipynb'])
    expect(finder.partial.value).toEqual(['big'])
    expect(finder.failed.value).toEqual(['locked'])
  })

  it('drops the answer of a load that a newer one replaced', async () => {
    let release: (value: unknown) => void = () => {}
    listBuckets.mockReturnValueOnce(new Promise((resolve) => (release = resolve))).mockResolvedValueOnce([{ name: 'new' }])
    listObjectsRecursive.mockImplementation(async (name: string) => ({ objects: [{ key: `${name}.ipynb` }], truncated: false }))
    const finder = useNotebookFinder()
    const first = finder.load()
    await finder.load()
    release([{ name: 'old' }])
    await first

    expect(finder.buckets.value).toEqual(['new'])
    expect(finder.notebooks.value.map((entry) => entry.key)).toEqual(['new.ipynb'])
  })
})
