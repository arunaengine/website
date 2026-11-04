import * as VueRuntime from 'vue'
import { defineComponent, h, reactive, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuditPage, AuditRecord } from '@/lib/api'
import * as Utils from '@/lib/utils'
import { click, compileClientComponent, content, element, flush, moduleDefault, mountApp, nodes } from '@/test/clientRender'

const route = reactive<{ query: Record<string, string> }>({ query: {} })
const replace = vi.fn((to: { query: Record<string, string> }) => {
  route.query = to.query
  return Promise.resolve()
})
const listGroupAudit = vi.fn<(groupId: string, query: Record<string, unknown>) => Promise<AuditPage>>()
const resolveUsers = vi.fn(() => Promise.resolve([]))

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const ListShellStub = defineComponent({
  props: { state: String, emptyTitle: String, error: String },
  setup: (props, { slots }) => () =>
    h('div', { 'data-state': props.state }, props.state === 'ready' ? [slots.default?.(), slots.footer?.()] : [props.emptyTitle ?? '', props.error ?? '']),
})
const HeadingStub = defineComponent({
  props: { title: String, count: String },
  setup: (props, { slots }) => () => h('header', { 'data-count': props.count }, [props.title, slots.actions?.()]),
})
const IconButtonStub = defineComponent({
  props: { label: String },
  setup: (props, { attrs }) => () => h('button', { ...attrs, 'aria-label': props.label }),
})
const LinkStub = defineComponent({
  props: { to: Object },
  setup: (props, { slots }) => () => h('a', { 'data-to': JSON.stringify(props.to) }, slots.default?.()),
})

const trail = compileClientComponent(new URL('./GroupAuditTrail.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: LinkStub, useRoute: () => route, useRouter: () => ({ replace }) },
  '@lucide/vue': new Proxy({}, { get: () => Slotted('i') }),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/IconButton.vue': moduleDefault(IconButtonStub),
  '@/components/ui/ListShell.vue': moduleDefault(ListShellStub),
  '@/components/ui/NodeLabel.vue': moduleDefault(defineComponent({ props: { nodeId: String }, setup: (p) => () => h('span', p.nodeId) })),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/components/ui/RefreshButton.vue': moduleDefault(Slotted('button')),
  '@/components/ui/SectionHeading.vue': moduleDefault(HeadingStub),
  '@/composables/useAruna': { useAruna: () => ({ listGroupAudit, sessionEpoch: ref(1) }) },
  '@/composables/useUserDirectory': {
    useUserDirectory: () => ({ resolveUsers, cachedUser: (id: string) => (id === 'u-1' ? { user_id: 'u-1', name: 'Ada' } : null) }),
  },
  '@/lib/utils': Utils,
})

function record(extra: Partial<AuditRecord> = {}): AuditRecord {
  return {
    group_id: 'g1', document_id: 'doc-1', graph_iri: 'https://w3id.org/aruna/doc-1', user_id: 'u-1',
    node_id: 'node-a', operation: 'replace_rocrate', occurred_at_ms: 1_775_744_591_123, ...extra,
  }
}

function page(extra: Partial<AuditPage> = {}): AuditPage {
  return { records: [record()], partial: false, missing_overflow: 0, ...extra }
}

const mountedApps: Array<{ unmount: () => void }> = []

async function render() {
  const mounted = await mountApp(trail, { props: { groupId: 'g1' } })
  mountedApps.push(mounted.app)
  await flush()
  return mounted.root
}

const count = (root: Awaited<ReturnType<typeof render>>) => element(root, (node) => node.tag === 'header').props['data-count']

afterEach(() => {
  for (const app of mountedApps.splice(0)) app.unmount()
})

beforeEach(() => {
  route.query = {}
  replace.mockClear()
  listGroupAudit.mockReset()
})

describe('group audit trail', () => {
  it('lists what changed, who changed it and counts a complete trail', async () => {
    listGroupAudit.mockResolvedValue(page())
    const root = await render()

    expect(listGroupAudit).toHaveBeenCalledWith('g1', { documentId: undefined, cursor: undefined, limit: 50 })
    expect(content(root)).toContain('Saved the metadata')
    expect(content(root)).toContain('Ada')
    expect(count(root)).toBe('1 record')
  })

  it('continues the trail with the cursor and only then counts it', async () => {
    listGroupAudit.mockResolvedValueOnce(page({ next_cursor: 'c-1' }))
    listGroupAudit.mockResolvedValueOnce(page({ records: [record({ operation: 'delete' })] }))
    const root = await render()
    expect(count(root)).toBeUndefined()

    await click(element(root, (node) => node.tag === 'button' && content(node).includes('Load more')))
    await flush()

    expect(listGroupAudit).toHaveBeenLastCalledWith('g1', { documentId: undefined, cursor: 'c-1', limit: 50 })
    expect(content(root)).toContain('Deleted the dataset')
    expect(count(root)).toBe('2 records')
  })

  it('says a partial page may miss records and gives it no count', async () => {
    listGroupAudit.mockResolvedValue(page({ partial: true, missing_nodes: ['node-b'], missing_overflow: 2 }))
    const root = await render()

    expect(content(root)).toContain('3 nodes did not answer, so records may be missing.')
    expect(count(root)).toBeUndefined()
    expect(content(root)).not.toContain('Load more')
  })

  it('narrows the trail to one dataset on the node', async () => {
    listGroupAudit.mockResolvedValue(page())
    const root = await render()

    await click(element(root, (node) => node.props['aria-label'] === 'Show only this dataset'))
    await flush()

    expect(replace).toHaveBeenCalledWith({ query: { audit_dataset: 'doc-1' } })
    expect(listGroupAudit).toHaveBeenLastCalledWith('g1', { documentId: 'doc-1', cursor: undefined, limit: 50 })
    expect(content(root)).toContain('Showing one dataset')
    expect(nodes(root).some((node) => node.props['aria-label'] === 'Show only this dataset')).toBe(false)
  })

  it('drops an answer for a filter that is no longer chosen', async () => {
    let answerOld: (value: AuditPage) => void = () => undefined
    listGroupAudit.mockReturnValueOnce(new Promise((resolve) => (answerOld = resolve)))
    listGroupAudit.mockResolvedValueOnce(page({ records: [record({ document_id: 'doc-2', operation: 'create' })] }))
    const root = await render()

    route.query = { audit_dataset: 'doc-2' }
    await flush()
    answerOld(page({ records: [record({ operation: 'delete' })] }))
    await flush()

    expect(content(root)).toContain('Created the dataset')
    expect(content(root)).not.toContain('Deleted the dataset')
  })
})
