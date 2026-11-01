import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

const listCatalogPage = vi.fn(async () => ({ documents: [], limit: 24, offset: 0, total_returned: 0 }))
vi.mock('@/composables/useAruna', () => ({ useAruna: () => ({ sessionEpoch: ref(1), listCatalogPage }) }))

const { useCatalogBrowse } = await import('./useCatalogBrowse')

describe('catalog browse window', () => {
  it('asks for the latest changed datasets first', async () => {
    await useCatalogBrowse().load({ limit: 24, offset: 0, groupId: null, summary: true })

    expect(listCatalogPage).toHaveBeenCalledWith({ limit: 24, offset: 0, groupId: null, summary: true, order: 'recent' })
  })
})
