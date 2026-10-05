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
// The real Switch is a radix control; the stub toggles on click and shows its label.
const SwitchStub = defineComponent({
  props: { checked: Boolean, disabled: Boolean },
  emits: ['update:checked'],
  setup: (props, { attrs, emit }) => () =>
    h('button', { disabled: props.disabled, onClick: () => emit('update:checked', !props.checked) }, String(attrs['aria-label'] ?? '')),
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
const sourceEncrypted = ref<boolean | null>(null)

const dialog = compileClientComponent(new URL('./SyncBucketDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/components/ui/Spinner.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/components/ui/Switch.vue': moduleDefault(SwitchStub),
  '@/components/ui/Dialog.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogContent.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slotted('header')),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slotted('h2')),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slotted('p')),
  '@/components/ui/DocsLink.vue': moduleDefault(DocsLinkStub),
  '@/components/ui/DialogFooter.vue': moduleDefault(Slotted('footer')),
  '@/components/ui/DialogClose.vue': moduleDefault(Slotted('div')),
  '@/components/data/BucketSearchBox.vue': moduleDefault(SearchBoxStub),
  '@/composables/useAruna': { useAruna: () => ({ apiBaseUrl: ref('http://a/api/v1'), createSyncRelationship }) },
  '@/composables/useEncryptedSource': { useEncryptedSource: () => sourceEncrypted },
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
async function render(encrypted: boolean | null = null) {
  sourceEncrypted.value = encrypted
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

  it('creates the sync back on the target node', async () => {
    const root = await render()

    await click(button(root, 'Node B'))
    await click(button(root, 'Sync in both directions'))
    await click(button(root, 'Sync now'))

    expect(createSyncRelationship).toHaveBeenCalledTimes(2)
    expect(createSyncRelationship.mock.calls[1]).toEqual([
      {
        source: { bucket: 'reef-survey' },
        target: { node_id: 'node-a', bucket: 'reef-survey' },
        mode: 'once',
        reference_handling: 'materialize',
        replicate_deletes: false,
      },
      { baseUrl: 'http://b/api/v1' },
    ])
  })

  it('keeps the dialog open when only the sync back fails', async () => {
    const root = await render()
    createSyncRelationship.mockResolvedValueOnce({ id: 's-1' }).mockRejectedValueOnce(new Error('boom'))

    await click(button(root, 'Node B'))
    await click(button(root, 'Sync in both directions'))
    await click(button(root, 'Sync now'))

    expect(content(root)).toContain('The sync to Node B was created, but the sync back failed: boom')
    expect(button(root, 'Sync now').props.disabled).toBe(false)
  })

  it('blocks the same bucket on the same node', async () => {
    const root = await render()

    await click(button(root, 'Node A'))

    expect(button(root, 'Sync now').props.disabled).toBe(true)
    expect(content(root)).toContain('Source and target are the same bucket and prefix')
  })

  it('offers an unencrypted copy only for an encrypted source', async () => {
    for (const state of [null, false]) {
      expect(content(await render(state))).not.toContain('Store the copy unencrypted')
    }

    const root = await render(true)
    expect(content(root)).toContain('Store the copy unencrypted')
    await click(button(root, 'Reference'))
    expect(content(root)).not.toContain('Store the copy unencrypted')
  })

  it('asks for an unencrypted copy with a warning, but not for the sync back', async () => {
    const root = await render(true)

    await click(button(root, 'Node B'))
    await click(button(root, 'Store the copy unencrypted'))
    expect(content(root)).toContain('The copy is stored unencrypted at the target.')
    await click(button(root, 'Sync in both directions'))
    await click(button(root, 'Sync now'))

    expect(createSyncRelationship.mock.calls[0][0]).toMatchObject({ plaintext: true })
    expect(createSyncRelationship.mock.calls[1][0]).not.toHaveProperty('plaintext')
  })

  it('sends no plaintext flag unless it is chosen', async () => {
    const root = await render(true)

    await click(button(root, 'Node B'))
    await click(button(root, 'Sync now'))

    expect(createSyncRelationship.mock.calls[0][0]).not.toHaveProperty('plaintext')
  })

  it('explains a refused copy of an encrypted source', async () => {
    const root = await render(true)
    createSyncRelationship.mockRejectedValueOnce(new Api.ApiError(403, 'forbidden'))

    await click(button(root, 'Node B'))
    await click(button(root, 'Sync now'))
    expect(content(root)).toContain('the target bucket must be encrypted too, unless you store the copy unencrypted')

    createSyncRelationship.mockRejectedValueOnce(new Api.ApiError(403, 'forbidden'))
    await click(button(root, 'Store the copy unencrypted'))
    await click(button(root, 'Sync now'))
    expect(content(root)).toContain('only its key holders may store an unencrypted copy')
  })
})
