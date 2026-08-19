import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useUnifiedSearch } from './useUnifiedSearch'

const mocks = vi.hoisted(() => ({ searchUnified: vi.fn() }))

vi.mock('@/composables/useAruna', async () => {
  const { ref } = await import('vue')
  return {
    useAruna: () => ({
      searchUnified: mocks.searchUnified,
      authToken: ref(''),
      apiBaseUrl: ref('/api/v1'),
    }),
  }
})

afterEach(() => {
  mocks.searchUnified.mockReset()
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
  })
})
