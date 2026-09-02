import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as Api from '@/lib/api'
import * as Storage from '@/lib/storage'
import * as Utils from '@/lib/utils'
import type { BackendStatus, GroupBackendResponse, InfoResponse, StorageRoutingRule } from '@/lib/api'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  flush,
  mountApp,
  moduleDefault,
  nodes,
} from '@/test/clientRender'

const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const Titled = defineComponent({
  props: { title: String, message: String },
  setup: (props, { slots }) => () => h('div', [props.title ?? props.message ?? '', slots.default?.()]),
})
const PickerStub = defineComponent({
  props: { modelValue: Object, backends: Array, ariaLabel: String },
  setup: (props) => () => h('select', { 'aria-label': props.ariaLabel }),
})

const getBucketRouting = vi.fn()
const listGroupBackends = vi.fn()
const nodeInfo = ref<InfoResponse | null>(null)

const section = compileClientComponent(new URL('./BucketRoutingSection.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: Slotted('a') },
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/DocsLink.vue': moduleDefault(Slotted('a')),
  '@/components/ui/Input.vue': moduleDefault(Slotted('input')),
  '@/components/ui/Switch.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Skeleton.vue': moduleDefault(Slotted('div')),
  '@/components/ui/EmptyState.vue': moduleDefault(Titled),
  '@/components/ui/ErrorPanel.vue': moduleDefault(Titled),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/components/groups/RoutingTargetPicker.vue': moduleDefault(PickerStub),
  '@/composables/useAruna': {
    useAruna: () => ({
      getBucketRouting,
      putBucketRouting: vi.fn(),
      listGroupBackends,
      nodeInfo,
      saving: ref(false),
    }),
  },
  '@/lib/connectivity': {
    OFFLINE_WRITE_HINT: 'offline',
    useConnectivity: () => ({ writesDisabled: ref(false) }),
  },
  '@/lib/api': Api,
  '@/lib/storage': Storage,
  '@/lib/utils': Utils,
})

function backend(id: string, disabled?: boolean): GroupBackendResponse {
  return { backend_id: id, group_id: 'g-1', kind: 's3', name: `Backend ${id}`, public_config: {}, disabled }
}

/** A node whose operator backends offer tenants the given storage classes. */
function withClasses(classes: string[]): InfoResponse {
  const backends: BackendStatus[] = classes.map((name) => ({
    name,
    backend: 's3',
    class: name,
    allow_tenants: true,
    default: false,
    status: 'ok',
  }))
  return { services: { blob: { backends } } } as unknown as InfoResponse
}

async function render(options: { rules?: StorageRoutingRule[]; backends?: GroupBackendResponse[]; classes?: string[] } = {}) {
  getBucketRouting.mockResolvedValue({ bucket: 'reef-survey', rules: options.rules ?? [], warnings: [] })
  listGroupBackends.mockResolvedValue({ backends: options.backends ?? [] })
  nodeInfo.value = withClasses(options.classes ?? [])
  const { root } = await mountApp(section, { props: { open: true, bucket: 'reef-survey', groupId: 'g-1' } })
  await flush()
  return root
}

describe('bucket routing rules', () => {
  it('blocks a new rule until the group has a storage backend to route to', async () => {
    const root = await render()

    expect(button(root, 'Add rule').props.disabled).toBe(true)
    expect(content(root).replace(/\s+/g, ' ')).toContain('Add a storage backend on the group Storage tab first.')
    const link = element(root, (node) => node.tag === 'a' && content(node).trim() === 'group Storage tab')
    expect(link.props.to).toEqual({ name: 'group', params: { id: 'g-1' }, query: { tab: 'storage' } })

    await click(button(root, 'Add rule'))
    expect(nodes(root).filter((node) => node.props['aria-label'] === 'Remove rule 1')).toHaveLength(0)
  })

  it('keeps stored rules visible and removable while blocked', async () => {
    const root = await render({ rules: [{ key_prefix: 'raw/', exact: false, target: { class: 'cold' } }] })

    expect(element(root, (node) => node.props['aria-label'] === 'Key prefix of rule 1').props['model-value']).toBe('raw/')
    expect(button(root, 'Add rule').props.disabled).toBe(true)

    await click(element(root, (node) => node.props['aria-label'] === 'Remove rule 1'))

    expect(content(root)).toContain('No rules yet.')
  })

  it('offers a new rule once an enabled group backend exists', async () => {
    const root = await render({ backends: [backend('b-1')] })

    expect(button(root, 'Add rule').props.disabled).toBe(false)
    expect(content(root)).not.toContain('Add a storage backend')

    await click(button(root, 'Add rule'))

    expect(element(root, (node) => node.props['aria-label'] === 'Target of rule 1').tag).toBe('select')
  })

  it('ignores a disabled backend but counts a tenant storage class', async () => {
    expect(button(await render({ backends: [backend('b-1', true)] }), 'Add rule').props.disabled).toBe(true)
    expect(button(await render({ classes: ['cold'] }), 'Add rule').props.disabled).toBe(false)
  })
})
