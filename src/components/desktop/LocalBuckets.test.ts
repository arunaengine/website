import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Workspaces from '@/lib/workspaces'
import * as Utils from '@/lib/utils'
import { compileClientComponent, content, flush, moduleDefault, mountApp } from '@/test/clientRender'

const identity = ref<{ nodeId: string; realm: string } | null>({ nodeId: 'device-1', realm: 'r' })
const searchBuckets = vi.fn()

const LinkStub = defineComponent({
  props: { to: { type: Object, required: true } },
  setup: (props, { slots }) => () => h('a', { 'data-to': JSON.stringify(props.to) }, slots.default?.()),
})
const Plain = defineComponent((_, { slots }) => () => h('span', slots.default?.()))

const LocalBuckets = compileClientComponent(new URL('./LocalBuckets.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: LinkStub },
  '@lucide/vue': new Proxy({}, { get: () => Plain }),
  '@/components/ui/Badge.vue': moduleDefault(Plain),
  '@/composables/useAruna': { useAruna: () => ({ searchBuckets, sessionEpoch: ref(0) }) },
  '@/composables/useDeviceStatus': { useDeviceStatus: () => ({ identity }) },
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ isLocalNode: (id: string) => id === 'device-1' }) },
  '@/lib/workspaces': Workspaces,
  '@/lib/utils': Utils,
})

const hit = (bucket: string, nodeId: string) => ({ arn: '', bucket, node_id: nodeId, group_id: 'g1', group_name: 'Lab', created_at: '' })

beforeEach(() => {
  identity.value = { nodeId: 'device-1', realm: 'r' }
  searchBuckets.mockReset()
})

describe('buckets stored on this computer', () => {
  it('reads every page and keeps only the buckets of this node', async () => {
    searchBuckets
      .mockResolvedValueOnce({ hits: [hit('lab', 'node-1'), hit('notes', 'device-1')], next_cursor: 'c2' })
      .mockResolvedValueOnce({ hits: [hit('ws-01abc', 'device-1'), hit('folder-01m5rs8b3hngjtjva82x7vv8ng', 'device-1'), hit('scans', 'device-1')], next_cursor: null })
    const mounted = await mountApp(LocalBuckets)
    await flush()

    expect(searchBuckets).toHaveBeenNthCalledWith(2, '', { limit: 50, cursor: 'c2' })
    const text = content(mounted.root)
    expect(text).toContain('notes')
    expect(text).toContain('scans')
    expect(text).not.toContain('lab')
    expect(text).not.toContain('ws-01abc')
    expect(text).not.toContain('folder-01m5')
    mounted.app.unmount()
  })

  it('says when the buckets cannot be listed instead of showing none', async () => {
    searchBuckets.mockRejectedValueOnce(new Error('search is down'))
    const mounted = await mountApp(LocalBuckets)
    await flush()

    expect(content(mounted.root)).toContain('could not be listed: search is down')
    expect(content(mounted.root)).not.toContain('No bucket is stored here.')
    mounted.app.unmount()
  })

  it('waits for the node to name itself', async () => {
    identity.value = null
    const mounted = await mountApp(LocalBuckets)

    expect(searchBuckets).not.toHaveBeenCalled()
    expect(content(mounted.root)).toContain('Looking for buckets on this computer')
    mounted.app.unmount()
  })
})
