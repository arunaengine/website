import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, element, flush, moduleDefault, mountApp } from '@/test/clientRender'
import * as Api from '@/lib/api'
import { isUnavailable, listFailure } from '@/composables/useShareVisit'
import { errorMessage, formatBytes, formatDateTime } from '@/lib/utils'

let sent: Array<{ url: string; body: unknown }> = []
const assign = vi.fn()
const listings: Record<string, unknown> = {
  '': { files: [{ name: 'table.csv', size: 2048, last_modified: '2026-10-30T08:00:00Z' }], folders: ['plots/', 'far/'], next_cursor: 'C2' },
  'C2': { files: [{ name: 'notes.txt', size: 10 }], folders: [], next_cursor: null },
  'plots/': { files: [{ name: 'plots/a.png', size: 5 }], folders: [], next_cursor: null },
}

const Pass = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const ButtonStub = defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()) })

const VisitFiles = compileClientComponent(new URL('./VisitFiles.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => null) }),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/ListPager.vue': moduleDefault(Pass),
  '@/components/ui/RefusalNote.vue': moduleDefault(defineComponent({ props: { message: String }, setup: (props) => () => h('p', props.message) })),
  '@/components/ui/Spinner.vue': moduleDefault(Pass),
  '@/components/shares/VisitUpload.vue': moduleDefault(defineComponent({ props: { prefix: String }, setup: (props) => () => h('section', `upload into "${props.prefix}"`) })),
  '@/composables/useShareVisit': { isUnavailable, listFailure },
  '@/lib/api': Api,
  '@/lib/utils': { errorMessage, formatBytes, formatDateTime },
})

const visit = <T>(call: (token: string, base: string) => Promise<T>) => call('v1', 'https://node.test/api/v1')

beforeEach(() => {
  sent = []
  assign.mockClear()
  vi.stubGlobal('window', { location: { origin: 'https://portal.test', assign } })
  vi.stubGlobal('fetch', vi.fn(async (input: URL, init: RequestInit = {}) => {
    const url = new URL(String(input))
    sent.push({ url: String(input), body: init.body ? JSON.parse(String(init.body)) : undefined })
    if (url.pathname.endsWith('/tickets')) return new Response(JSON.stringify({ path: '/api/v1/shares/download?ticket=T1', expires_at: '' }))
    const key = url.searchParams.get('cursor') ?? url.searchParams.get('prefix') ?? ''
    // The member holding `far/` of a distributed bucket cannot be reached.
    if (key === 'far/') return new Response(JSON.stringify({ error: 'unreachable', code: 'range_unavailable' }), { status: 503 })
    return new Response(JSON.stringify(listings[key]))
  }))
})

afterEach(() => vi.unstubAllGlobals())

describe('VisitFiles', () => {
  it('lists every page of the shared root, opens folders and goes back by the breadcrumb', async () => {
    const { root } = await mountApp(VisitFiles, { props: { visit, rootName: 'results', uploads: true } })
    await vi.waitFor(() => expect(content(root)).toContain('notes.txt'))
    expect(content(root)).toContain('2 KiB')
    expect(content(root)).toContain('upload into ""')

    await click(button(root, 'plots'))
    await vi.waitFor(() => expect(content(root)).toContain('a.png'))
    expect(content(root)).not.toContain('table.csv')
    expect(content(root)).toContain('upload into "plots/"')

    await click(button(root, 'results'))
    await vi.waitFor(() => expect(content(root)).toContain('table.csv'))
  })

  it('says to try again later when part of a distributed folder cannot be listed', async () => {
    const { root } = await mountApp(VisitFiles, { props: { visit, rootName: 'results', uploads: false } })
    await vi.waitFor(() => expect(content(root)).toContain('table.csv'))

    await click(button(root, 'far'))
    await vi.waitFor(() => expect(content(root)).toContain('Part of this folder cannot be listed right now. Try again later.'))
  })

  it('downloads through a fresh single-use ticket on the node origin', async () => {
    const { root } = await mountApp(VisitFiles, { props: { visit, rootName: 'results', uploads: false } })
    await vi.waitFor(() => expect(content(root)).toContain('table.csv'))

    await click(element(root, (node) => node.props['aria-label'] === 'Download table.csv'))
    await flush()

    expect(sent.at(-1)).toEqual({ url: 'https://node.test/api/v1/shares/visit/tickets', body: { name: 'table.csv' } })
    expect(assign).toHaveBeenCalledWith('https://node.test/api/v1/shares/download?ticket=T1')
    expect(content(root)).not.toContain('upload into')
  })
})
