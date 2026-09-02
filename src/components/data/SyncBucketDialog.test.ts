import { computed, defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as Api from '@/lib/api'
import * as Utils from '@/lib/utils'
import * as Workspaces from '@/lib/workspaces'
import { button, click, compileClientComponent, content, flush, mountApp, moduleDefault } from '@/test/clientRender'

interface Option {
  value: string
  label: string
}

const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const InputStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: [String, Number] },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h('input', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    }),
})
// The real Select is a radix listbox; the stub renders one button per option.
const SelectStub = defineComponent({
  props: { modelValue: String, options: { type: Array, default: () => [] }, ariaLabel: String },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () =>
    h(
      'select',
      { 'aria-label': props.ariaLabel },
      (props.options as Option[]).map((option) =>
        h('button', { onClick: () => emit('update:modelValue', option.value) }, option.label),
      ),
    ),
})
const SearchBoxStub = defineComponent({
  props: { modelValue: String },
  emits: ['update:modelValue', 'select'],
  setup: (props) => () => h('input', { 'aria-label': 'Target bucket', value: props.modelValue }),
})
const DocsLinkStub = defineComponent({
  props: { section: String, icon: Boolean },
  setup: (props) => () => h('a', { 'data-section': props.section, 'data-icon': props.icon }),
})

const NODES = [
  { nodeId: 'node-a', label: 'Node A', isLocal: true, reachable: true, apiBase: 'http://a/api/v1' },
  { nodeId: 'node-b', label: 'Node B', isLocal: false, reachable: true, apiBase: 'http://b/api/v1' },
]
const createSyncRelationship = vi.fn()

const dialog = compileClientComponent(new URL('./SyncBucketDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/components/ui/Spinner.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/components/ui/Switch.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Dialog.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogContent.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slotted('header')),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slotted('h2')),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slotted('p')),
  '@/components/ui/DocsLink.vue': moduleDefault(DocsLinkStub),
  '@/components/ui/DialogFooter.vue': moduleDefault(Slotted('footer')),
  '@/components/ui/DialogClose.vue': moduleDefault(Slotted('div')),
  '@/components/data/BucketSearchBox.vue': moduleDefault(SearchBoxStub),
  '@/composables/useAruna': { useAruna: () => ({ createSyncRelationship }) },
  '@/composables/useRealmNodes': {
    useRealmNodes: () => ({
      nodes: computed(() => NODES),
      localNodeId: ref('node-a'),
      nodeById: (id: string) => NODES.find((node) => node.nodeId === id) ?? null,
      displayName: (id: string | null) => NODES.find((node) => node.nodeId === id)?.label ?? 'this node',
    }),
  },
  '@/lib/api': Api,
  '@/lib/workspaces': Workspaces,
  '@/lib/utils': Utils,
})

// The dialog resets its fields when `open` flips to true, as the page does.
async function render() {
  createSyncRelationship.mockReset()
  createSyncRelationship.mockResolvedValue({ id: 's-1' })
  const open = ref(false)
  const host = defineComponent({
    setup: () => () => h(dialog, { open: open.value, sourceBucket: 'reef-survey', sourcePrefix: '', sourceNodeId: null }),
  })
  const { root } = await mountApp(host)
  open.value = true
  await flush()
  return root
}

describe('sync bucket dialog', () => {
  it('creates a one-off sync to the picked node with the defaults', async () => {
    const root = await render()

    expect(button(root, 'Sync now').props.disabled).toBe(true)
    await click(button(root, 'Node B'))
    await click(button(root, 'Sync now'))

    expect(createSyncRelationship).toHaveBeenCalledWith(
      {
        source: { bucket: 'reef-survey' },
        target: { node_id: 'node-b', bucket: 'reef-survey' },
        mode: 'once',
        reference_handling: 'materialize',
        replicate_deletes: false,
      },
      {},
    )
  })

  it('sends preserve for a reference sync and hides the reference choice', async () => {
    const root = await render()
    expect(content(root)).toContain('When a source object points at data elsewhere')

    await click(button(root, 'Node B'))
    await click(button(root, 'Reference'))
    expect(button(root, 'Reference').props['aria-pressed']).toBe(true)
    expect(content(root)).not.toContain('When a source object points at data elsewhere')

    await click(button(root, 'Create sync'))

    expect(createSyncRelationship.mock.calls[0][0]).toMatchObject({ mode: 'reference', reference_handling: 'preserve' })
  })

  it('offers the three ways to treat pointers as pressed options', async () => {
    const root = await render()

    await click(button(root, 'Node B'))
    await click(button(root, 'Keep in sync'))
    await click(button(root, 'Leave those objects out'))
    await click(button(root, 'Create sync'))

    expect(button(root, 'Leave those objects out').props['aria-pressed']).toBe(true)
    expect(createSyncRelationship.mock.calls[0][0]).toMatchObject({ mode: 'continuous', reference_handling: 'skip' })
  })

  it('blocks the same bucket on the same node', async () => {
    const root = await render()

    await click(button(root, 'Node A'))

    expect(button(root, 'Sync now').props.disabled).toBe(true)
    expect(content(root)).toContain('Source and target are the same bucket and prefix')
  })
})
