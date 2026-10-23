import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import * as Utils from '@/lib/utils'
import * as Workspaces from '@/lib/workspaces'
import {
  button,
  click,
  compileClientComponent,
  content,
  input,
  element,
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
const SpinnerStub = defineComponent({ props: { label: String }, setup: () => () => h('i') })
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
  '@/components/ui/Spinner.vue': moduleDefault(SpinnerStub),
  '@/components/groups/GroupSelect.vue': moduleDefault(SelectStub),
  '@/components/data/BucketSearchBox.vue': moduleDefault(BucketSearchStub),
  '@/composables/useAruna': { useAruna: () => ({ myGroups }) },
  '@/composables/useRealmNodes': {
    useRealmNodes: () => ({
      nodes: ref([
        { nodeId: 'node-offline', kind: 'server', label: 'Offline node', reachable: false },
        { nodeId: 'node-1', kind: 'server', label: 'Realm node', reachable: true },
      ]),
    }),
  },
  '@/composables/useS3': {
    useS3,
  },
  '@/composables/useSyncedFolders': { useSyncedFolders: () => ({ bind, busy }) },
  '@/lib/api': { ApiError },
  '@/lib/utils': Utils,
  '@/lib/workspaces': Workspaces,
  '@/lib/desktopBridge': { pickDirectory: vi.fn(async () => '/home/me/data') },
})

async function mountReady(props: Record<string, unknown> = {}) {
  const mounted = await mountApp(BindFolderDialog, { props: { open: true, ...props } })
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

    await click(button(mounted.root, 'Start syncing'))

    expect(useS3).not.toHaveBeenCalled()
    expect(bind).toHaveBeenCalledWith(
      expect.objectContaining({
        group_id: 'g1',
        remote: { node_id: 'node-1', bucket: 'new-bucket', prefix: '' },
        create_bucket: true,
      }),
    )
    expect(content(mounted.root)).toContain('A bucket that does not exist yet is made for you.')
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('binds an existing search hit without asking the node to create it', async () => {
    const mounted = await mountReady()

    await click(button(mounted.root, 'Use existing bucket'))
    await click(button(mounted.root, 'Start syncing'))

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

    await click(button(mounted.root, 'Start syncing'))

    expect(content(mounted.root)).toContain(conflict)
    mounted.app.unmount()
  })
})

describe('choosing what the sync does', () => {
  const preset = { bucket: 'lab', nodeId: 'node-1', groupId: 'g1' }

  it('keeps a copy by default on a bucket page and never creates the bucket', async () => {
    const mounted = await mountReady(preset)
    const html = content(mounted.root)

    expect(html).toContain('Sync to this computer')
    expect(html).toContain('What do you want to do?')
    expect(html).toContain('Keep a copy on this computer')
    expect(html).toContain('Realm node')
    expect(element(mounted.root, (node) => node.props['data-testid'] === 'chosen-bucket')).toBeTruthy()

    await click(button(mounted.root, 'Start syncing'))

    expect(bind).toHaveBeenCalledWith({
      root: '/home/me/data',
      group_id: 'g1',
      remote: { node_id: 'node-1', bucket: 'lab', prefix: '' },
      create_bucket: false,
      mode: 'download_only',
      propagate_deletes: true,
    })
    mounted.app.unmount()
  })

  it('sends the three directions to the node as their modes', async () => {
    for (const [title, mode] of [
      ['Send a folder to Aruna', 'upload_only'],
      ['Both ways', 'two_way'],
      ['Keep a copy on this computer', 'download_only'],
    ] as const) {
      bind.mockClear()
      const mounted = await mountReady(preset)
      await click(button(mounted.root, title))
      await click(button(mounted.root, 'Start syncing'))

      expect(bind).toHaveBeenCalledWith(expect.objectContaining({ mode }))
      mounted.app.unmount()
    }
  })

  it('offers a different bucket after Pick another', async () => {
    const mounted = await mountReady(preset)

    await click(button(mounted.root, 'Pick another'))

    expect(() => element(mounted.root, (node) => node.props['data-testid'] === 'chosen-bucket')).toThrow()
    expect(input(mounted.root, 'aria-label', 'Bucket name')).toBeTruthy()
    mounted.app.unmount()
  })

  it('needs an existing bucket to keep a copy of', async () => {
    const mounted = await mountReady()
    await click(button(mounted.root, 'Keep a copy on this computer'))
    await typeValue(input(mounted.root, 'aria-label', 'Bucket name'), 'brand-new')

    expect(content(mounted.root)).toContain('Pick a bucket that exists')
    await click(button(mounted.root, 'Start syncing'))
    expect(bind).not.toHaveBeenCalled()
    mounted.app.unmount()
  })

  it('says an older node cannot keep a copy yet', async () => {
    bind.mockRejectedValue(new ApiError(400, 'unknown variant `download_only`'))
    const mounted = await mountReady(preset)

    await click(button(mounted.root, 'Start syncing'))

    expect(content(mounted.root)).toContain('cannot keep a copy on this computer yet')
    mounted.app.unmount()
  })

  it('keeps the node refusal verbatim for any other failure', async () => {
    bind.mockRejectedValue(new ApiError(409, 'The folder is not empty.'))
    const mounted = await mountReady(preset)

    await click(button(mounted.root, 'Start syncing'))

    expect(content(mounted.root)).toContain('The folder is not empty.')
    mounted.app.unmount()
  })
})
