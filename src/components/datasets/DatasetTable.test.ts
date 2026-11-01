import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it, vi } from 'vitest'
import type { MetadataDoc } from '@/data/types'

vi.mock('vue-router', () => ({ RouterLink: defineComponent((_, { slots }) => () => h('a', slots.default?.())), useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/composables/useAruna', async () => {
  const { ref } = await import('vue')
  return { useAruna: () => ({ myGroups: ref([{ id: 'g1', name: 'Reef lab' }]) }) }
})
const resolveUsers = vi.hoisted(() => vi.fn())
vi.mock('@/composables/useUserDirectory', () => ({
  useUserDirectory: () => ({ resolveUsers, cachedUser: (id: string) => (id === USER ? { name: 'Ana Lima' } : null) }),
}))
const USER = '01M63KXP71RJ4MJAEDT9ZJ1VXP@Q0iiGwoTikaR1gx2t9n6V5yqcDbN0FGLVvxnOYRdsB4'

const DatasetTable = (await import('./DatasetTable.vue')).default

const doc = (ulid: string, title: string, extra: Partial<MetadataDoc> = {}) =>
  ({ ulid, title, description: '', realmId: 'g1', license: 'https://creativecommons.org/licenses/by/4.0/', keywords: [], updatedAt: '2026-10-28T10:00:00Z', roCrate: {}, ...extra }) as MetadataDoc

async function render(docs: MetadataDoc[], canFavourite: boolean) {
  const html = await renderToString(createSSRApp(DatasetTable, { docs, canFavourite, isFavourite: (id: string) => id === 'a', busy: new Set<string>() }))
  return html.replace(/<!--[^>]*-->/g, '').replace(/<[^>]+aria-label="([^"]+)"[^>]*>/g, ' $1 ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

describe('dataset table', () => {
  it('gives every type the same columns, a run by the person who started it', async () => {
    const run = {
      conformsToIds: ['https://w3id.org/ro/wfrun/process/0.5'],
      roCrate: {
        '@graph': [
          { '@id': '#r', '@type': 'CreateAction', actionStatus: 'http://schema.org/FailedActionStatus', agent: { '@id': `#agent-${USER}` } },
          { '@id': `#agent-${USER}`, '@type': 'Person', identifier: USER },
        ],
      },
    }
    const text = await render([doc('a', 'Reef census'), doc('b', 'Coral run', run)], true)
    expect(text).toContain('Name Type Status License By Updated')
    expect(text).not.toContain('Size')
    expect(text).toContain('Reef census Dataset CC BY 4.0 Reef lab')
    expect(text).toContain('Coral run Process run Failed CC BY 4.0 Ana Lima')
    expect(text).not.toContain(USER)
    expect(resolveUsers).toHaveBeenCalledWith([USER])
    expect(text).toContain('Remove from favourites')
    expect(text).toContain('Add to favourites')
  })

  it('adds size when a row has one and leaves the favourite column out for a guest', async () => {
    const sized = { roCrate: { '@graph': [{ '@id': './', contentSize: '2048' }] }, realmId: 'g2' }
    const text = await render([doc('a', 'Reef census'), doc('b', 'Coral survey', sized)], false)
    expect(text).toContain('Name Type Status License By Size Updated')
    expect(text).toContain('Coral survey Dataset CC BY 4.0 - 2.0 KiB')
    expect(text).not.toContain('favourites')
  })
})
