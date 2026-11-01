import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { compileClientComponent, content, element, mountApp, moduleDefault, type HostNode } from '@/test/clientRender'

const Empty = defineComponent(() => () => null)
const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
let opened: unknown = null
const DeleteDialogStub = defineComponent({ props: { request: Object }, setup: (props) => () => ((opened = props.request), null) })
const canDeletePrefix = vi.fn(() => false)
const refresh = vi.fn()
const forgetBucket = vi.fn()

const Section = compileClientComponent(new URL('./BucketDeleteSection.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { useRouter: () => ({ push: vi.fn() }) },
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/data/DeleteDialog.vue': moduleDefault(DeleteDialogStub),
  '@/components/distributed/SetDeleteDialog.vue': moduleDefault(Empty),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/composables/useBuckets': { useBuckets: () => ({ refresh }) },
  '@/composables/useAllBuckets': { forgetBucket },
  '@/composables/useBucketShortcuts': { useBucketShortcuts: () => ({ remove: vi.fn(), recent: ref([]), pinned: ref([]) }) },
  '@/composables/useS3': { useS3: () => ({ canDeletePrefix }) },
  '@/lib/distributedMock': { mockEnabled: () => false },
  '@/lib/distributedMockData': { mockBucket: () => undefined },
  '@/lib/distribution': { isMulti: () => false },
})

const deleteButton = (root: HostNode) => element(root, (node) => node.tag === 'button' && content(node).includes('Delete bucket'))

describe('BucketDeleteSection', () => {
  it('deletes a bucket on another node through that node', async () => {
    const { root, app } = await mountApp(Section, { props: { bucket: 'demo', nodeId: 'node-2', groupId: 'g1' } })
    expect(deleteButton(root).props.disabled).toBe(false)
    expect(content(root)).not.toContain('Only the node that serves this bucket')
    ;(deleteButton(root).props.onClick as () => void)()
    await VueRuntime.nextTick()
    expect(opened).toEqual({ kind: 'bucket', bucket: 'demo', nodeId: 'node-2' })
    app.unmount()
  })

  it('still needs a session that may delete a bucket on this node', async () => {
    const { root, app } = await mountApp(Section, { props: { bucket: 'local', nodeId: null, groupId: 'g1' } })
    expect(deleteButton(root).props.disabled).toBe(true)
    expect(content(root)).toContain('This session cannot delete this bucket')
    app.unmount()
  })
})
