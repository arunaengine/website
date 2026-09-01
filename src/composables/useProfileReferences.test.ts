import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { REFERENCE_LOOKUP_FAILED, useProfileReferences } from './useProfileReferences'

const mocks = vi.hoisted(() => ({ searchMetadata: vi.fn() }))

vi.mock('@/composables/useAruna', () => ({
  useAruna: () => ({ searchMetadata: mocks.searchMetadata }),
}))

const IRI = 'https://w3id.org/aruna/profile/01J0PROFILE0000000000000'
const OTHER_IRI = 'https://w3id.org/aruna/profile/01J0OTHER00000000000000'

function hit(documentId: string, title: string, groupId = 'group-1') {
  return {
    document_id: documentId,
    group_id: groupId,
    document_path: `datasets/${documentId}`,
    graph_iri: `urn:${documentId}`,
    subject_iri: './',
    score: 1,
    title,
  }
}

afterEach(() => {
  mocks.searchMetadata.mockReset()
})

describe('useProfileReferences', () => {
  it('filters the search by the profile IRI', async () => {
    mocks.searchMetadata.mockResolvedValue({
      hits: [hit('doc-1', 'Sequencing run'), hit('doc-2', 'Imaging set', 'group-2')],
      nodes_queried: 2,
      nodes_failed: 0,
    })
    const iri = ref<string | null>(null)
    const { warning } = useProfileReferences(iri)

    await nextTick()
    expect(mocks.searchMetadata).not.toHaveBeenCalled()
    expect(warning.value).toBeNull()

    iri.value = IRI
    await vi.waitFor(() => expect(warning.value).not.toBeNull())

    expect(mocks.searchMetadata).toHaveBeenCalledWith('', expect.objectContaining({
      conforms_to: IRI,
      limit: 100,
    }))
    expect(warning.value?.message).toContain('2 datasets declare this profile.')
    expect(warning.value?.message).toContain('Datasets of other groups will no longer be able to save')
    expect(warning.value?.datasets).toEqual([
      { documentId: 'doc-1', groupId: 'group-1', title: 'Sequencing run' },
      { documentId: 'doc-2', groupId: 'group-2', title: 'Imaging set' },
    ])
    expect(warning.value?.incomplete).toBe(false)
  })

  it('collapses repeated documents and reports missing nodes', async () => {
    mocks.searchMetadata.mockResolvedValue({
      hits: [hit('doc-1', 'Sequencing run'), hit('doc-1', 'Sequencing run'), hit('doc-3', '')],
      nodes_queried: 3,
      nodes_failed: 1,
    })
    const { warning } = useProfileReferences(ref(IRI))
    await vi.waitFor(() => expect(warning.value).not.toBeNull())

    expect(warning.value?.message).toContain('2 datasets declare this profile.')
    // A hit without a served title still has to be nameable.
    expect(warning.value?.datasets[1]).toEqual({
      documentId: 'doc-3',
      groupId: 'group-1',
      title: 'datasets/doc-3',
    })
    expect(warning.value?.incomplete).toBe(true)
  })

  it('says so when the lookup fails', async () => {
    mocks.searchMetadata.mockRejectedValue(new Error('Search is unavailable.'))
    const { warning } = useProfileReferences(ref(IRI))
    await vi.waitFor(() => expect(warning.value).not.toBeNull())

    expect(warning.value).toEqual({
      message: REFERENCE_LOOKUP_FAILED,
      failed: true,
      incomplete: false,
      datasets: [],
    })
  })

  it('drops the answer for a profile that changed', async () => {
    let resolveFirst: ((value: unknown) => void) | undefined
    mocks.searchMetadata.mockImplementation((_query: string, options: { conforms_to: string }) =>
      options.conforms_to === IRI
        ? new Promise((resolve) => { resolveFirst = resolve })
        : Promise.resolve({ hits: [hit('doc-9', 'Other profile dataset')], nodes_queried: 1, nodes_failed: 0 }),
    )
    const iri = ref<string | null>(IRI)
    const { warning } = useProfileReferences(iri)
    await vi.waitFor(() => expect(resolveFirst).toBeDefined())

    iri.value = OTHER_IRI
    await vi.waitFor(() => expect(warning.value?.datasets).toHaveLength(1))
    resolveFirst?.({ hits: [hit('doc-1', 'Stale'), hit('doc-2', 'Stale')], nodes_queried: 1, nodes_failed: 0 })
    await nextTick()

    expect(warning.value?.datasets).toEqual([
      { documentId: 'doc-9', groupId: 'group-1', title: 'Other profile dataset' },
    ])
  })
})
