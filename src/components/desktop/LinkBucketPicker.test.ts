import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as BucketPlace from '@/lib/bucketPlace'
import * as Workspaces from '@/lib/workspaces'
import { button, click, compileClientComponent, content, element, moduleDefault, mountApp } from '@/test/clientRender'

const hit = (bucket: string, node_id: string) => ({
  arn: `${node_id}/${bucket}`,
  bucket,
  node_id,
  group_id: 'g1',
  group_name: 'Lab group',
  created_at: '',
})
const listed = [hit('test', 'node-1'), hit('test', 'device'), hit('notes', 'laptop'), hit('ws-run', 'node-2')]
const hits = ref(listed)
const more = ref(false)
const loadMore = vi.fn()
const nodes = new Map<string, Record<string, unknown>>([
  ['node-1', { nodeId: 'node-1', kind: 'server', label: 'node-1', isLocal: false, location: 'Giessen' }],
  ['device', { nodeId: 'device', kind: 'user', label: 'device 12D3…', isLocal: true, location: null }],
  ['laptop', { nodeId: 'laptop', kind: 'user', label: "Lena's laptop", isLocal: false, location: null }],
])
const useBucketSearch = vi.fn(() => ({
  hits,
  searching: ref(false),
  searched: ref(true),
  error: ref(null),
  more,
  loadMore,
}))

const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })
const LinkBucketPicker = compileClientComponent(new URL('./LinkBucketPicker.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': icons,
  '@/components/ui/Spinner.vue': moduleDefault(defineComponent(() => () => h('i'))),
  '@/composables/useBucketSearch': { useBucketSearch },
  '@/composables/useRealmNodes': {
    useRealmNodes: () => ({
      nodeById: (id: string) => nodes.get(id) ?? null,
      isLocalNode: (id: string) => id === 'device',
      displayName: (id: string) => id,
    }),
  },
  '@/lib/bucketPlace': BucketPlace,
  '@/lib/workspaces': Workspaces,
})

async function mountOpen(props: Record<string, unknown> = {}) {
  const mounted = await mountApp(LinkBucketPicker, { props: { modelValue: 'test', ...props } })
  const wrapper = element(mounted.root, (node) => typeof node.props.onFocusin === 'function')
  await (wrapper.props.onFocusin as () => void)()
  await VueRuntime.nextTick()
  return mounted
}

const option = (root: Parameters<typeof element>[0], text: string) =>
  element(root, (node) => node.tag === 'button' && node.props.role === 'option' && content(node).includes(text))

describe('the bucket picker of Link a local folder', () => {
  afterEach(() => {
    hits.value = listed
    more.value = false
    loadMore.mockClear()
  })

  it('offers the next page instead of claiming no match', async () => {
    more.value = true
    const mounted = await mountOpen()

    expect(loadMore).not.toHaveBeenCalled()
    await click(button(mounted.root, 'Load more'))
    expect(loadMore).toHaveBeenCalledTimes(1)
    mounted.app.unmount()
  })

  it('asks for the next page when a page holds only workspace buckets', async () => {
    hits.value = [hit('ws-run', 'node-2')]
    more.value = true
    const mounted = await mountOpen()

    expect(loadMore).toHaveBeenCalled()
    expect(content(mounted.root)).not.toContain('No bucket matched.')
    mounted.app.unmount()
  })

  it('lists every bucket with its place, without a node filter', async () => {
    const mounted = await mountOpen()

    expect(useBucketSearch).toHaveBeenCalledWith(expect.anything(), { listAll: true })
    expect(content(option(mounted.root, 'node-1 · Giessen'))).toContain('Lab group')
    expect(content(mounted.root)).not.toContain('ws-run')
    mounted.app.unmount()
  })

  it('greys buckets on devices with the reason and never picks them', async () => {
    const onSelect = vi.fn()
    const mounted = await mountOpen({ onSelect })
    const here = option(mounted.root, 'This computer')
    const laptop = option(mounted.root, "Lena's laptop")

    expect(here.props.disabled).toBe(true)
    expect(content(here)).toContain('Already here, nothing to link')
    expect(laptop.props.disabled).toBe(true)
    await click(here)
    expect(onSelect).not.toHaveBeenCalled()

    await click(option(mounted.root, 'node-1 · Giessen'))
    expect(onSelect).toHaveBeenCalledWith(hits.value[0])
    mounted.app.unmount()
  })

  it('asks for New bucket with the typed name instead of creating one', async () => {
    const onNew = vi.fn()
    const mounted = await mountOpen({ onNew })

    await click(button(mounted.root, 'New bucket "test"…'))

    expect(onNew).toHaveBeenCalledWith('test')
    mounted.app.unmount()
  })
})
