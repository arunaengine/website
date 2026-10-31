import { effectScope, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const aruna = vi.hoisted(() => ({
  getPartTarget: vi.fn(),
  getBucketUsage: vi.fn(),
  listBucketObjects: vi.fn(),
  getDataLinks: vi.fn(),
  sessionEpoch: { value: 1 },
}))
vi.mock('@/composables/useAruna', () => ({ useAruna: () => aruna }))
vi.mock('@/composables/useRealmNodes', () => ({ useRealmNodes: () => ({ isLocalNode: (id: string) => id === 'n1' }) }))

const { useLinkedParts } = await import('./useLinkedParts')

const PART = 'arn:aruna:r:n2:s3/refseq/'
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  vi.clearAllMocks()
  aruna.getBucketUsage.mockResolvedValue({ bucket: 'refseq', objects: 120, logical_bytes: 1024, complete: true })
  aruna.listBucketObjects.mockResolvedValue({ bucket: 'refseq', prefixes: ['genomes/'], objects: [{ key: 'README.md', version_id: 'v', size: 12 }] })
  aruna.getDataLinks.mockResolvedValue({ documents: [{ document_id: 'd1' }, { document_id: 'd2', title: 'Other' }], complete: true })
})

describe('useLinkedParts', () => {
  it('reads where a whole bucket is, its count, its top entries and the other datasets', async () => {
    aruna.getPartTarget.mockResolvedValue({ id: PART, bucket: 'refseq', prefix: '', node_id: 'n2', held_here: false })
    const scope = effectScope()
    const facts = scope.run(() => useLinkedParts(ref([PART]), ref('d1'), () => true))!
    await settle()

    const part = facts.value.get(PART)!
    expect(aruna.getBucketUsage).toHaveBeenCalledWith('refseq', 'n2')
    expect(aruna.listBucketObjects).toHaveBeenCalledWith('refseq', { prefix: undefined, delimiter: '/', limit: 11 }, 'n2')
    expect(part.route).toEqual({ name: 'bucket', params: { bucketId: 'refseq' }, query: { node: 'n2' } })
    expect(part.usage?.objects).toBe(120)
    expect(part.entries?.list.map((entry) => [entry.name, entry.folder])).toEqual([['genomes', true], ['README.md', false]])
    expect(part.entries?.list[0].route).toEqual({ name: 'bucket', params: { bucketId: 'refseq' }, query: { prefix: 'genomes', node: 'n2' } })
    expect(part.others.map((other) => other.document_id)).toEqual(['d2'])
    scope.stop()
  })

  it('counts no bucket for a folder and lists nothing when the dataset lists its files', async () => {
    aruna.getPartTarget.mockResolvedValue({ id: PART, bucket: 'refseq', prefix: 'raw/', node_id: 'n1', held_here: true })
    const scope = effectScope()
    const facts = scope.run(() => useLinkedParts(ref([PART]), ref('d1'), () => false))!
    await settle()

    expect(aruna.getBucketUsage).not.toHaveBeenCalled()
    expect(aruna.listBucketObjects).not.toHaveBeenCalled()
    expect(facts.value.get(PART)?.entries).toBeNull()
    scope.stop()
  })

  it('drops an answer that arrives after the page moved to another dataset', async () => {
    const answers: Array<(value: unknown) => void> = []
    aruna.getPartTarget.mockImplementation(() => new Promise((resolve) => answers.push(resolve)))
    const dataset = ref('d1')
    const scope = effectScope()
    const facts = scope.run(() => useLinkedParts(ref([PART]), dataset, () => true))!
    dataset.value = 'd3'
    await nextTick()
    answers[0]({ id: PART, bucket: 'refseq', prefix: '', node_id: 'n2', held_here: false })
    await settle()

    expect(aruna.getPartTarget).toHaveBeenCalledTimes(2)
    expect(aruna.listBucketObjects).not.toHaveBeenCalled()
    expect(facts.value.size).toBe(0)
    scope.stop()
  })
})
