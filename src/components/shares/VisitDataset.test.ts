import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { compileClientComponent, content, element, flush, moduleDefault, mountApp, nodes } from '@/test/clientRender'
import * as Api from '@/lib/api'
import * as ShareLinks from '@/lib/shareLinks'
import { isUnavailable } from '@/composables/useShareVisit'
import { errorMessage, formatBytes, formatDateTime } from '@/lib/utils'

const PART = 'https://w3id.org/aruna/data/part'
const FILE = 'https://w3id.org/aruna/data/file'
let sent: Array<{ url: string; body: unknown }> = []
const assign = vi.fn()
const listings: Record<string, unknown> = {
  '': { files: [{ name: 'readme.txt', size: 2048 }], folders: ['run-1/'], next_cursor: null },
  'run-1/': { files: [{ name: 'run-1/table.csv', size: 5 }], folders: [], next_cursor: null },
  'many/': { files: Array.from({ length: 12 }, (_, index) => ({ name: `many/f${String(index).padStart(2, '0')}.txt`, size: 1 })), folders: [], next_cursor: null },
}

const Pass = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const ButtonStub = defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()) })

const VisitDataset = compileClientComponent(new URL('./VisitDataset.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => null) }),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/ListPager.vue': moduleDefault(defineComponent({
    props: { page: Number, pageSize: Number, total: Number },
    emits: ['update:page'],
    setup: (props, { emit }) => () => h('nav', { onNext: () => emit('update:page', (props.page ?? 1) + 1) }, `page ${props.page} of ${props.total}`),
  })),
  '@/components/ui/RefusalNote.vue': moduleDefault(defineComponent({ props: { message: String }, setup: (props) => () => h('p', props.message) })),
  '@/components/ui/Spinner.vue': moduleDefault(Pass),
  '@/composables/useShareVisit': { isUnavailable },
  '@/lib/api': Api,
  '@/lib/shareLinks': ShareLinks,
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
    if (url.pathname.endsWith('/dataset/tickets')) return new Response(JSON.stringify({ path: '/api/v1/shares/download?ticket=T1', expires_at: '' }))
    if (url.pathname.endsWith('/dataset/files')) return new Response(JSON.stringify(listings[url.searchParams.get('prefix') ?? '']))
    return new Response(JSON.stringify({
      dataset_id: 'D1',
      rocrate: { '@graph': [{ '@id': './', name: 'Reef survey' }] },
      files: [{ entity_id: PART, name: 'results', kind: 'folder' }, { entity_id: FILE, name: 'summary.pdf', kind: 'file' }],
    }))
  }))
})

afterEach(() => vi.unstubAllGlobals())

const folderButton = (root: Parameters<typeof content>[0], label: string) =>
  element(root, (node) => node.tag === 'button' && node.props['aria-expanded'] !== undefined && content(node).includes(label))

describe('VisitDataset', () => {
  it('expands a folder part and its subfolders in place and collapses them again', async () => {
    const { root } = await mountApp(VisitDataset, { props: { visit } })
    await vi.waitFor(() => expect(content(root)).toContain('summary.pdf'))
    expect(content(root)).toContain('Reef survey')
    expect(content(root)).not.toContain('readme.txt')

    await (folderButton(root, 'results').props.onClick as () => Promise<void>)()
    await flush()
    expect(content(root)).toContain('readme.txt')
    expect(sent.at(-1)?.url).toBe(`https://node.test/api/v1/shares/visit/dataset/files?part=${encodeURIComponent(PART)}&limit=1000`)

    await (folderButton(root, 'run-1').props.onClick as () => Promise<void>)()
    await flush()
    expect(content(root)).toContain('table.csv')
    expect(sent.at(-1)?.url).toContain('prefix=run-1%2F')

    await (folderButton(root, 'results').props.onClick as () => Promise<void>)()
    await flush()
    expect(content(root)).not.toContain('readme.txt')
  })

  it('pages an opened folder of more than 10 entries on its own', async () => {
    listings[''] = { files: [{ name: 'readme.txt', size: 2048 }], folders: ['run-1/', 'many/'], next_cursor: null }
    try {
      const { root } = await mountApp(VisitDataset, { props: { visit } })
      await vi.waitFor(() => expect(content(root)).toContain('summary.pdf'))
      await (folderButton(root, 'results').props.onClick as () => Promise<void>)()
      await flush()
      expect(nodes(root).filter((node) => node.tag === 'nav')).toHaveLength(0)

      await (folderButton(root, 'many').props.onClick as () => Promise<void>)()
      await flush()
      const pager = element(root, (node) => node.tag === 'nav')
      expect(content(pager)).toBe('page 1 of 12')
      expect(content(root)).toContain('f09.txt')
      expect(content(root)).not.toContain('f10.txt')

      await (pager.props.onNext as () => void)()
      await flush()
      expect(content(root)).toContain('f11.txt')
      expect(content(root)).not.toContain('f00.txt')
      expect(content(root)).toContain('readme.txt')
    } finally {
      listings[''] = { files: [{ name: 'readme.txt', size: 2048 }], folders: ['run-1/'], next_cursor: null }
    }
  })

  it('downloads a dataset file by its id and a file inside a part by the part and its name', async () => {
    const { root } = await mountApp(VisitDataset, { props: { visit } })
    await vi.waitFor(() => expect(content(root)).toContain('summary.pdf'))
    const downloadOf = (label: string) => nodes(root).find((node) => node.props['aria-label'] === `Download ${label}`)!

    await (downloadOf('summary.pdf').props.onClick as () => Promise<void>)()
    await flush()
    expect(sent.at(-1)?.body).toEqual({ entity_id: FILE })

    await (folderButton(root, 'results').props.onClick as () => Promise<void>)()
    await flush()
    await (folderButton(root, 'run-1').props.onClick as () => Promise<void>)()
    await flush()
    await (downloadOf('table.csv').props.onClick as () => Promise<void>)()
    await flush()
    expect(sent.at(-1)?.body).toEqual({ entity_id: PART, name: 'run-1/table.csv' })
    expect(assign).toHaveBeenLastCalledWith('https://node.test/api/v1/shares/download?ticket=T1')
    expect(downloadOf('results')).toBeUndefined()
  })
})
