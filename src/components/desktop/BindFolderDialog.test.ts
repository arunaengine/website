import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Workspaces from '@/lib/workspaces'
import {
  button,
  click,
  compileClientComponent,
  content,
  input,
  moduleDefault,
  mountApp,
  typeValue,
} from '@/test/clientRender'

const bind = vi.fn()
const useS3 = vi.fn()
const busy = ref(false)
const myGroups = ref([{ id: 'g1', name: 'Lab group' }])

const existingHit = {
  arn: 'aruna:bucket:lab',
  bucket: 'lab',
  group_id: 'g1',
  group_name: 'Lab group',
  node_id: 'node-1',
}

const Passthrough = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const RefusalStub = defineComponent({
  props: { message: { type: String, required: true } },
  setup: (props) => () => h('div', props.message),
})
const InputStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: { type: String, default: '' }, placeholder: String },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h('input', {
      ...attrs,
      value: props.modelValue,
      placeholder: props.placeholder,
      onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    }),
})
const SelectStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h('select', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    }),
})
const SwitchStub = defineComponent(() => () => h('button'))
const BucketSearchStub = defineComponent({
  props: { modelValue: { type: String, default: '' }, placeholder: String },
  emits: ['update:modelValue', 'select'],
  setup: (props, { emit }) => () =>
    h('div', [
      h('input', {
        'aria-label': props.placeholder,
        value: props.modelValue,
        onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
      }),
      h('button', { onClick: () => emit('select', existingHit) }, 'Use existing bucket'),
    ]),
})
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })

const dialogStubs = Object.fromEntries(
  ['Dialog', 'DialogContent', 'DialogHeader', 'DialogTitle', 'DialogDescription', 'DialogFooter', 'DialogClose'].map(
    (name) => [`@/components/ui/${name}.vue`, moduleDefault(Passthrough)],
  ),
)

const BindFolderDialog = compileClientComponent(new URL('./BindFolderDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': icons,
  ...dialogStubs,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/components/ui/Switch.vue': moduleDefault(SwitchStub),
  '@/components/ui/RefusalNote.vue': moduleDefault(RefusalStub),
  '@/components/groups/GroupSelect.vue': moduleDefault(SelectStub),
  '@/components/data/BucketSearchBox.vue': moduleDefault(BucketSearchStub),
  '@/composables/useAruna': { useAruna: () => ({ myGroups }) },
  '@/composables/useRealmNodes': {
    useRealmNodes: () => ({
      nodes: ref([
        { nodeId: 'node-offline', kind: 'storage', label: 'Offline node', reachable: false },
        { nodeId: 'node-1', kind: 'storage', label: 'Realm node', reachable: true },
      ]),
    }),
  },
  '@/composables/useS3': {
    useS3,
  },
  '@/composables/useSyncedFolders': { useSyncedFolders: () => ({ bind, busy }) },
  '@/lib/workspaces': Workspaces,
  '@/lib/desktopBridge': { pickDirectory: vi.fn(async () => '/home/me/data') },
})

async function mountReady() {
  const mounted = await mountApp(BindFolderDialog, { props: { open: true } })
  await click(button(mounted.root, 'Choose'))
  return mounted
}

beforeEach(() => {
  bind.mockReset()
  bind.mockResolvedValue({ folder_id: 'f1' })
  useS3.mockClear()
  busy.value = false
})

describe('syncing a folder to a bucket', () => {
  it('asks the node plane to create an unmatched bucket while binding', async () => {
    const mounted = await mountReady()
    await typeValue(input(mounted.root, 'aria-label', 'Bucket name'), 'new-bucket')

    await click(button(mounted.root, 'Sync a folder'))

    expect(useS3).not.toHaveBeenCalled()
    expect(bind).toHaveBeenCalledWith(
      expect.objectContaining({
        group_id: 'g1',
        remote: { node_id: 'node-1', bucket: 'new-bucket', prefix: '' },
        create_bucket: true,
      }),
    )
    expect(content(mounted.root)).toContain('A new name creates the bucket on the selected node.')
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('binds an existing search hit without asking the node to create it', async () => {
    const mounted = await mountReady()

    await click(button(mounted.root, 'Use existing bucket'))
    await click(button(mounted.root, 'Sync a folder'))

    expect(useS3).not.toHaveBeenCalled()
    expect(bind).toHaveBeenCalledWith(
      expect.objectContaining({
        remote: expect.objectContaining({ bucket: 'lab' }),
        create_bucket: false,
      }),
    )
    mounted.app.unmount()
  })

  it('shows a group conflict from the node verbatim', async () => {
    const conflict = 'The bucket "lab" already belongs to group g2.'
    bind.mockRejectedValue(new Error(conflict))
    const mounted = await mountReady()
    await typeValue(input(mounted.root, 'aria-label', 'Bucket name'), 'lab')

    await click(button(mounted.root, 'Sync a folder'))

    expect(content(mounted.root)).toContain(conflict)
    mounted.app.unmount()
  })
})
