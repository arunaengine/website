import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it, vi } from 'vitest'
import type { MetadataDoc } from '@/data/types'

vi.mock('vue-router', () => ({ RouterLink: defineComponent((_, { slots }) => () => h('a', slots.default?.())) }))
vi.mock('@/components/metadata/ProfileChip.vue', () => ({ default: defineComponent(() => () => h('span', 'profile chip')) }))

const DatasetTable = (await import('./DatasetTable.vue')).default

const doc = (ulid: string, title: string) =>
  ({ ulid, title, description: `${title} notes`, author: 'Ada', keywords: ['one', 'two', 'three', 'four'], updatedAt: '2026-10-28T10:00:00Z' }) as MetadataDoc

async function render(canFavourite: boolean) {
  const html = await renderToString(
    createSSRApp(DatasetTable, { docs: [doc('a', 'Reef census'), doc('b', 'Coral survey')], canFavourite, isFavourite: (id: string) => id === 'a', busy: new Set<string>() }),
  )
  return html.replace(/<!--[^>]*-->/g, '').replace(/<[^>]+aria-label="([^"]+)"[^>]*>/g, ' $1 ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

describe('dataset table', () => {
  it('lists title, description, author, three keywords, profile and the day of the last change', async () => {
    const text = await render(true)
    expect(text).toContain('Title Author Keywords Profile Updated')
    expect(text).toContain('Reef census Reef census notes Ada #one #two #three profile chip 2026-10-28')
    expect(text).not.toContain('#four')
    expect(text).toContain('Remove from favourites')
    expect(text).toContain('Add to favourites')
  })

  it('leaves the favourite column out for a guest', async () => {
    const text = await render(false)
    expect(text).not.toContain('favourites')
    expect(text).not.toContain('Favourite')
  })
})
