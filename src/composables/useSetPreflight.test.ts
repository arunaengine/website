import { effectScope, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import type { StorageDeletionPreflight } from '@/lib/storageDeletion'

const aruna = vi.hoisted(() => ({ sessionEpoch: { value: 1 }, getSetDeletion: vi.fn() }))
vi.mock('@/composables/useAruna', () => ({ useAruna: () => aruna }))

const { coverageNotes, useSetPreflight } = await import('@/composables/useSetPreflight')

function answer(coverage: Partial<StorageDeletionPreflight['reference_coverage']> = {}): StorageDeletionPreflight {
  return {
    scope: { kind: 'bucket', bucket: 'spire' },
    counts: { current_heads: 1, noncurrent_versions: 0, delete_markers: 0, open_multipart_uploads: 0, complete: true },
    sync_relationships_apply_to_bucket_delete: true,
    sync_relationships: [],
    permissions: { read: true, purge: true },
    truncation: { truncated: false, versions_truncated: false, multipart_uploads_truncated: false },
    reference_coverage: { complete: true, hidden_references_exist: false, queried_nodes: 3, failed_nodes: 0, index_freshness: 'current', excluded: [], ...coverage },
    linked_datasets: [{ document_id: 'd1', group_id: 'g', document_path: 'datasets/d1', graph_iri: 'i', title: 'One', links: [] }],
  }
}

function start(name: string | null = 'spire') {
  const asked = ref(name)
  const scope = effectScope()
  const lookup = scope.run(() => useSetPreflight(asked))!
  return { asked, lookup, scope }
}

describe('set deletion preflight', () => {
  beforeEach(() => {
    aruna.getSetDeletion.mockReset()
    aruna.sessionEpoch.value = 1
  })

  it('asks the node for the bucket and keeps its linked datasets', async () => {
    aruna.getSetDeletion.mockResolvedValue(answer())
    const { lookup, scope } = start()
    await vi.waitFor(() => expect(lookup.loading.value).toBe(false))

    expect(aruna.getSetDeletion).toHaveBeenCalledWith('spire')
    expect(lookup.preflight.value?.linked_datasets?.map((document) => document.document_id)).toEqual(['d1'])
    scope.stop()
  })

  it('does not ask while no bucket is shown', () => {
    const { lookup, scope } = start(null)

    expect(aruna.getSetDeletion).not.toHaveBeenCalled()
    expect(lookup.loading.value).toBe(false)
    scope.stop()
  })

  it('keeps a failed lookup apart from an empty list', async () => {
    aruna.getSetDeletion.mockRejectedValue(new ApiError(503, 'busy'))
    const { lookup, scope } = start()
    await vi.waitFor(() => expect(lookup.loading.value).toBe(false))

    expect(lookup.preflight.value).toBeNull()
    expect(lookup.error.value).toBeTruthy()
    scope.stop()
  })

  it('drops the answer of a bucket that is no longer shown', async () => {
    let release: (value: StorageDeletionPreflight) => void = () => {}
    aruna.getSetDeletion.mockReturnValueOnce(new Promise((resolve) => (release = resolve)))
    const { asked, lookup, scope } = start()
    asked.value = null
    await nextTick()
    release(answer())
    await Promise.resolve()

    expect(lookup.preflight.value).toBeNull()
    expect(lookup.loading.value).toBe(false)
    scope.stop()
  })

  it('names why the list may be incomplete', () => {
    expect(coverageNotes(answer().reference_coverage)).toEqual([])
    expect(coverageNotes(answer({ complete: false, failed_nodes: 2, index_freshness: 'pending', hidden_references_exist: true }).reference_coverage))
      .toEqual(['2 node(s) did not answer.', 'A node is still indexing.', 'Some datasets are not visible to you.'])
    expect(coverageNotes(answer({ complete: false }).reference_coverage)).toEqual(['The node cannot say that the list is complete.'])
  })
})
