import { createSSRApp, defineComponent, h, ref, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const items = ref<Array<{ text: string; atMs: number | null }>>([])
const state = ref('ready')
const load = vi.fn(async () => undefined)

let FolderHistory: Component

beforeAll(async () => {
  vi.doMock('vue-router', () => ({ RouterLink: defineComponent((_, { slots }) => () => h('a', slots.default?.())) }))
  vi.doMock('@/composables/useFolderDecisions', () => ({ useFolderDecisions: () => ({ items, state, load }) }))
  FolderHistory = (await import('./FolderHistory.vue')).default
})

beforeEach(() => {
  items.value = []
  state.value = 'ready'
  load.mockClear()
})

const render = (props: Record<string, unknown> = {}) =>
  renderToString(createSSRApp(FolderHistory, { folderId: 'f1', mode: 'two_way', startedMs: null, ...props }))

describe('folder history', () => {
  it('lists the decisions and ends with the day syncing started', async () => {
    items.value = [{ text: 'Kept your version of samplesheet.csv', atMs: Date.now() }]
    const html = await render({ startedMs: new Date(2026, 9, 12, 14, 20).getTime() })

    expect(html).toContain('Kept your version of samplesheet.csv')
    expect(html).toContain('Today,')
    expect(html).toContain('Started syncing this folder, both ways.')
    expect(html.indexOf('Kept your version')).toBeLessThan(html.indexOf('Started syncing'))
    expect(html).toContain('Open')
  })

  it('names the way a folder that only keeps a copy started', async () => {
    const html = await render({ mode: 'download_only', startedMs: 1_700_000_000_000 })

    expect(html).toContain('Started syncing this folder, keeping a copy on this computer.')
  })

  it('says nothing was decided instead of an empty list', async () => {
    expect(await render()).toContain('You have not decided anything in this folder yet.')
  })

  it('says an older node keeps no history instead of an empty one', async () => {
    state.value = 'unsupported'
    const html = await render()

    expect(html).toContain('does not keep a history of decisions yet')
    expect(html).not.toContain('You have not decided anything')
  })
})
