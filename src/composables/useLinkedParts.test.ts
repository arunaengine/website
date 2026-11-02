import { effectScope, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const aruna = vi.hoisted(() => ({
  getPartTarget: vi.fn(),
  getBucketUsage: vi.fn(),
  getBucketDistribution: vi.fn(),
  listBucketObjects: vi.fn(),
  getDataLinks: vi.fn(),
  searchBuckets: vi.fn(),
  sessionEpoch: { value: 1 },
  authToken: { value: 't' },
  nodeClientReady: vi.fn(async (node: string) => ({ baseUrl: `https://${node}.test/api/v1` })),
  getNodeInfo: vi.fn(async (node: string) => ({ services: { interfaces: { s3: { url: `https://s3.${node}.test/` } } } })),
  nodeInfo: { value: null },
}))
vi.mock('@/composables/useAruna', () => ({ useAruna: () => aruna }))
vi.mock('@/composables/useRealmNodes', () => ({ useRealmNodes: () => ({ isLocalNode: (id: string) => id === 'n1' }) }))

const { useLinkedParts, usePartFolders } = await import('./useLinkedParts')

const PART = 'arn:aruna:r:n2:s3/refseq/'
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  vi.clearAllMocks()
  aruna.sessionEpoch.value++
  aruna.authToken.value = 't'
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
    expect(part.nodes).toEqual(['n2'])
    expect(aruna.getBucketDistribution).not.toHaveBeenCalled()
    expect(part.entries?.list.map((entry) => [entry.name, entry.folder])).toEqual([['genomes', true], ['README.md', false]])
    expect(part.entries?.list[0].route).toEqual({ name: 'bucket', params: { bucketId: 'refseq' }, query: { prefix: 'genomes', node: 'n2' } })
    expect(part.others.map((other) => other.document_id)).toEqual(['d2'])
    scope.stop()
  })

  it('says why a visitor sees no files when the listing is refused', async () => {
    aruna.authToken.value = ''
    aruna.listBucketObjects.mockRejectedValue(new Error('Not authorized'))
    const scope = effectScope()
    const facts = scope.run(() => useLinkedParts(ref([PART]), ref('d1'), () => true))!
    await settle()

    expect(facts.value.get(PART)?.entries).toBeNull()
    expect(facts.value.get(PART)?.listError).toBe('Not authorized')

    const { folders, keyOf, toggle } = scope.run(() => usePartFolders(ref('d1')))!
    toggle(facts.value.get(PART)!, 'genomes/')
    await settle()
    expect(folders.value.get(keyOf(facts.value.get(PART)!, 'genomes/'))?.error).toBe('Not authorized')
    scope.stop()
  })

  it('lists a node ARN part signed out without the refused lookup and downloads its files there', async () => {
    aruna.authToken.value = ''
    const scope = effectScope()
    const facts = scope.run(() => useLinkedParts(ref([PART]), ref('d1'), () => true))!
    await settle()

    const part = facts.value.get(PART)!
    expect(aruna.getPartTarget).not.toHaveBeenCalled()
    expect(part.problem).toBeNull()
    expect(aruna.listBucketObjects).toHaveBeenCalledWith('refseq', { prefix: undefined, delimiter: '/', limit: 11 }, 'n2')
    expect(part.entries?.list.map((entry) => entry.download)).toEqual([
      undefined,
      `https://n2.test/api/v1/ga4gh/drs/v1/download?object_id=${encodeURIComponent('arn:aruna:r:n2:s3/refseq/README.md@v')}`,
    ])
    scope.stop()
  })

  it('still asks the node for a set part signed out and links files to Data signed in', async () => {
    const SET = 'https://w3id.org/aruna/data/r/s1/'
    aruna.authToken.value = ''
    aruna.getPartTarget.mockRejectedValue(new Error('Unauthorized'))
    const signedOut = effectScope()
    const refused = signedOut.run(() => useLinkedParts(ref([SET]), ref('d1'), () => true))!
    await settle()
    expect(aruna.getPartTarget).toHaveBeenCalledWith(SET)
    expect(refused.value.get(SET)?.problem).toBe('Unauthorized')
    signedOut.stop()

    aruna.authToken.value = 't'
    aruna.sessionEpoch.value++
    aruna.getPartTarget.mockResolvedValue({ id: PART, bucket: 'refseq', prefix: '', node_id: 'n2', held_here: false })
    const signedIn = effectScope()
    const facts = signedIn.run(() => useLinkedParts(ref([PART]), ref('d1'), () => true))!
    await settle()
    expect(facts.value.get(PART)?.entries?.list.every((entry) => !entry.download)).toBe(true)
    signedIn.stop()
  })

  it('names every member node of a bucket stored on more nodes', async () => {
    aruna.getPartTarget.mockResolvedValue({ id: PART, bucket: 'refseq', prefix: '', set_id: 's1', held_here: true })
    aruna.getBucketDistribution.mockResolvedValue({ members: [{ node_id: 'n1' }, { node_id: 'n2' }, { node_id: 'n3' }] })
    const scope = effectScope()
    const facts = scope.run(() => useLinkedParts(ref([PART]), ref('d1'), () => false))!
    await settle()

    expect(aruna.getBucketDistribution).toHaveBeenCalledWith('refseq', undefined, null)
    expect(facts.value.get(PART)?.nodes).toEqual(['n1', 'n2', 'n3'])
    scope.stop()
  })

  it('lists a distributed bucket through a member when this node holds none of it', async () => {
    aruna.getPartTarget.mockResolvedValue({ id: PART, bucket: 'refseq', prefix: '', set_id: 's1', held_here: false })
    aruna.searchBuckets.mockResolvedValue({ hits: [{ bucket: 'refseq', set_id: 'other', node_id: 'n4' }, { bucket: 'refseq', set_id: 's1', node_id: 'n3' }] })
    aruna.getBucketDistribution.mockResolvedValue({ members: [{ node_id: 'n2' }, { node_id: 'n3' }] })
    const scope = effectScope()
    const facts = scope.run(() => useLinkedParts(ref([PART]), ref('d1'), () => true))!
    await settle()

    const part = facts.value.get(PART)!
    expect(part.problem).toBeNull()
    expect(part.route).toEqual({ name: 'bucket', params: { bucketId: 'refseq' }, query: { node: 'n3' } })
    expect(aruna.getBucketUsage).toHaveBeenCalledWith('refseq', 'n3')
    expect(aruna.listBucketObjects).toHaveBeenCalledWith('refseq', { prefix: undefined, delimiter: '/', limit: 11 }, 'n3')
    expect(part.nodes).toEqual(['n2', 'n3'])
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

  it('shows the facts of an earlier visit at once and reads them again', async () => {
    aruna.getPartTarget.mockResolvedValue({ id: PART, bucket: 'refseq', prefix: '', node_id: 'n2', held_here: false })
    const first = effectScope()
    first.run(() => useLinkedParts(ref([PART]), ref('d1'), () => false))
    await settle()
    first.stop()
    aruna.getPartTarget.mockReturnValue(new Promise(() => {}))
    const scope = effectScope()
    const facts = scope.run(() => useLinkedParts(ref([PART]), ref('d1'), () => false))!
    expect(facts.value.get(PART)?.usage?.objects).toBe(120)
    expect(aruna.getPartTarget).toHaveBeenCalledTimes(2)
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

  it('downloads the files of a distributed bucket signed out by plain S3 on the member listed', async () => {
    const SET = 'https://w3id.org/aruna/data/r/s1/'
    aruna.authToken.value = ''
    aruna.getPartTarget.mockResolvedValue({ id: SET, bucket: 'refseq', prefix: '', set_id: 's1', held_here: false })
    aruna.searchBuckets.mockResolvedValue({ hits: [{ bucket: 'refseq', set_id: 's1', node_id: 'n3' }] })
    aruna.listBucketObjects.mockResolvedValue({ bucket: 'refseq', prefixes: [], objects: [{ key: 'GCF 1/a.txt', version_id: 'v', size: 3 }] })
    const scope = effectScope()
    const facts = scope.run(() => useLinkedParts(ref([SET]), ref('d1'), () => true))!
    await settle()

    expect(facts.value.get(SET)?.entries?.list[0].download).toBe('https://s3.n3.test/refseq/GCF%201/a.txt')
    scope.stop()
  })

  it('offers no visitor download from a node S3 address that is not HTTP(S)', async () => {
    const SET = 'https://w3id.org/aruna/data/r/s1/'
    aruna.authToken.value = ''
    aruna.getNodeInfo.mockResolvedValueOnce({ services: { interfaces: { s3: { url: 'javascript:alert(1)//x' } } } })
    aruna.getPartTarget.mockResolvedValue({ id: SET, bucket: 'refseq', prefix: '', set_id: 's1', held_here: false })
    aruna.searchBuckets.mockResolvedValue({ hits: [{ bucket: 'refseq', set_id: 's1', node_id: 'n3' }] })
    aruna.listBucketObjects.mockResolvedValue({ bucket: 'refseq', prefixes: [], objects: [{ key: 'a.txt', version_id: 'v', size: 3 }] })
    const scope = effectScope()
    const facts = scope.run(() => useLinkedParts(ref([SET]), ref('d1'), () => true))!
    await settle()

    expect(facts.value.get(SET)?.entries?.list[0].name).toBe('a.txt')
    expect(facts.value.get(SET)?.entries?.list[0].download).toBeUndefined()
    scope.stop()
  })
})

describe('usePartFolders', () => {
  const part = {
    target: { id: PART, bucket: 'refseq', prefix: '', node_id: 'n2', held_here: false },
    download: { drs: 'https://n2.test/api/v1', arn: 'arn:aruna:r:n2:s3/refseq/' },
  } as never

  it('lists a folder in place on its node, without its own marker, and closes it again', async () => {
    aruna.listBucketObjects.mockResolvedValue({ bucket: 'refseq', prefixes: ['g/x/'], objects: [{ key: 'g/', version_id: 'm', size: 0 }, { key: 'g/a.txt', version_id: 'v', size: 3 }] })
    const scope = effectScope()
    const { folders, keyOf, toggle } = scope.run(() => usePartFolders(ref('d1')))!
    toggle(part, 'g/')
    await settle()

    expect(aruna.listBucketObjects).toHaveBeenCalledWith('refseq', { prefix: 'g/', delimiter: '/', limit: 51 }, 'n2')
    const opened = folders.value.get(keyOf(part, 'g/'))!
    expect(opened.list.map((entry) => [entry.name, entry.prefix ?? null])).toEqual([['x', 'g/x/'], ['a.txt', null]])
    expect(opened.list[1].download).toContain(encodeURIComponent('arn:aruna:r:n2:s3/refseq/g/a.txt@v'))
    toggle(part, 'g/')
    expect(folders.value.size).toBe(0)
    scope.stop()
  })

  it('drops a listing that arrives after the page moved to another dataset', async () => {
    let answer: (value: unknown) => void = () => {}
    aruna.listBucketObjects.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const dataset = ref('d1')
    const scope = effectScope()
    const { folders, toggle } = scope.run(() => usePartFolders(dataset))!
    toggle(part, 'g/')
    dataset.value = 'd2'
    await nextTick()
    answer({ bucket: 'refseq', prefixes: [], objects: [] })
    await settle()

    expect(folders.value.size).toBe(0)
    scope.stop()
  })
})
