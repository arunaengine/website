import { effectScope, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type DataLinksResponse } from '@/lib/api'

const aruna = vi.hoisted(() => ({
  sessionEpoch: { value: 1 },
  getBucketLinks: vi.fn(),
  getDataLinks: vi.fn(),
}))
vi.mock('@/composables/useAruna', () => ({ useAruna: () => aruna }))

const { useDatasetLinks } = await import('@/composables/useDatasetLinks')
type Target = import('@/composables/useDatasetLinks').LinkTarget

const file: Target = { bucket: 'lab', key: 'raw/a.fq', folder: false, remote: false }

function page(ids: string[], extra: Partial<DataLinksResponse> = {}): DataLinksResponse {
  return {
    documents: ids.map((id) => ({ document_id: id, group_id: 'g', document_path: `datasets/${id}`, graph_iri: id, title: id, links: [] })),
    complete: true,
    hidden_references_exist: false,
    nodes_failed: 0,
    pending_materializations: 0,
    failed_materializations: 0,
    ...extra,
  }
}

function start(target: Target | null = file) {
  const asked = ref(target)
  const scope = effectScope()
  const links = scope.run(() => useDatasetLinks(asked))!
  return { asked, links, scope }
}

describe('dataset links', () => {
  beforeEach(() => {
    aruna.getBucketLinks.mockReset()
    aruna.getDataLinks.mockReset()
  })

  it('asks for the linked parts that contain a file', async () => {
    aruna.getBucketLinks.mockResolvedValue(page(['d1']))
    const { links, scope } = start()
    await vi.waitFor(() => expect(links.state.value).toBe('ready'))

    expect(aruna.getBucketLinks).toHaveBeenCalledWith('lab', { key: 'raw/a.fq', parts_only: true })
    expect(links.documents.value.map((document) => document.document_id)).toEqual(['d1'])
    scope.stop()
  })

  it('asks for the datasets that link exactly a folder or the bucket root', async () => {
    aruna.getBucketLinks.mockResolvedValue(page([]))
    const { links, scope } = start({ bucket: 'lab', key: '', folder: true, remote: false })
    await vi.waitFor(() => expect(links.state.value).toBe('ready'))

    expect(aruna.getBucketLinks).toHaveBeenCalledWith('lab', { prefix: '', parts_only: true })
    scope.stop()
  })

  it('asks for the datasets that name an identifier, with the bucket route left alone', async () => {
    aruna.getDataLinks.mockResolvedValue(page(['d1']))
    const part = 'https://w3id.org/aruna/data/r/s/'
    const { links, scope } = start({ bucket: '', key: '', folder: false, remote: false, id: part })
    await vi.waitFor(() => expect(links.state.value).toBe('ready'))

    expect(aruna.getDataLinks).toHaveBeenCalledWith(part, { parts_only: true })
    expect(aruna.getBucketLinks).not.toHaveBeenCalled()
    scope.stop()
  })

  it('reads a 404 as not available, never as no datasets', async () => {
    aruna.getBucketLinks.mockRejectedValue(new ApiError(404, 'not found'))
    const { links, scope } = start()
    await vi.waitFor(() => expect(links.state.value).toBe('missing'))

    expect(links.error.value).toBeNull()
    scope.stop()
  })

  it('keeps a failed read apart from an empty list', async () => {
    aruna.getBucketLinks.mockRejectedValue(new ApiError(503, 'no metadata node answered'))
    const { links, scope } = start()
    await vi.waitFor(() => expect(links.state.value).toBe('failed'))

    expect(links.error.value).toBe('no metadata node answered')
    scope.stop()
  })

  it('asks nothing for a bucket on another node', async () => {
    const { links, scope } = start({ ...file, remote: true })
    await nextTick()

    expect(links.state.value).toBe('missing')
    expect(aruna.getBucketLinks).not.toHaveBeenCalled()
    scope.stop()
  })

  it('appends the next page and keeps the coverage notes', async () => {
    aruna.getBucketLinks.mockResolvedValueOnce(page(['d1'], { next_after: 'd1', complete: false, hidden_references_exist: true }))
    aruna.getBucketLinks.mockResolvedValueOnce(page(['d2']))
    const { links, scope } = start()
    await vi.waitFor(() => expect(links.state.value).toBe('ready'))
    expect([links.more.value, links.complete.value, links.hidden.value]).toEqual([true, false, true])
    await links.loadMore()

    expect(aruna.getBucketLinks).toHaveBeenLastCalledWith('lab', { key: 'raw/a.fq', parts_only: true, after: 'd1' })
    expect(links.documents.value.map((document) => document.document_id)).toEqual(['d1', 'd2'])
    expect(links.more.value).toBe(false)
    scope.stop()
  })

  it('drops a late answer for the file that was open before', async () => {
    let late: (value: DataLinksResponse) => void = () => {}
    aruna.getBucketLinks.mockImplementationOnce(() => new Promise((resolve) => (late = resolve)))
    aruna.getBucketLinks.mockResolvedValueOnce(page(['d2']))
    const { asked, links, scope } = start()
    asked.value = { ...file, key: 'raw/b.fq' }
    await vi.waitFor(() => expect(links.documents.value).toHaveLength(1))
    late(page(['stale']))
    await nextTick()

    expect(links.documents.value.map((document) => document.document_id)).toEqual(['d2'])
    scope.stop()
  })
})
