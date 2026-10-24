import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import * as BucketPlace from '@/lib/bucketPlace'
import * as Utils from '@/lib/utils'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  input,
  moduleDefault,
  mountApp,
  typeValue,
} from '@/test/clientRender'

const bind = vi.fn()
const busy = ref(false)

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
const SwitchStub = defineComponent(() => () => h('button'))
const SpinnerStub = defineComponent({ props: { label: String }, setup: () => () => h('i') })
const PickerStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue', 'select', 'new'],
  setup: (props, { emit }) => () =>
    h('div', [
      h('input', {
        'aria-label': 'Bucket',
        value: props.modelValue,
        onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
      }),
      h('button', { onClick: () => emit('select', existingHit) }, 'Use existing bucket'),
      h('button', { onClick: () => emit('new', props.modelValue) }, 'Ask for a new bucket'),
    ]),
})
const NewBucketStub = defineComponent({
  props: { open: Boolean, name: String, groupId: String, forLink: Boolean },
  emits: ['update:open', 'link'],
  setup: (props, { emit }) => () =>
    props.open
      ? h('section', [
          h('span', `New bucket ${props.name} for link ${props.forLink}`),
          h(
            'button',
            {
              onClick: () => {
                emit('link', { bucket: props.name, nodeId: 'node-1', groupId: 'g1' })
                emit('update:open', false)
              },
            },
            'Confirm new bucket',
          ),
        ])
      : null,
})
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })

const dialogStubs = Object.fromEntries(
  ['Dialog', 'DialogContent', 'DialogHeader', 'DialogTitle', 'DialogDescription', 'DialogFooter', 'DialogClose'].map(
    (name) => [`@/components/ui/${name}.vue`, moduleDefault(Passthrough)],
  ),
)
const realmNode = { nodeId: 'node-1', kind: 'server', label: 'node-1 · Giessen', isLocal: false, location: 'Giessen' }

const BindFolderDialog = compileClientComponent(new URL('./BindFolderDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': icons,
  ...dialogStubs,
  '@/components/ui/Badge.vue': moduleDefault(Passthrough),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Switch.vue': moduleDefault(SwitchStub),
  '@/components/ui/RefusalNote.vue': moduleDefault(RefusalStub),
  '@/components/ui/Spinner.vue': moduleDefault(SpinnerStub),
  '@/components/desktop/LinkBucketPicker.vue': moduleDefault(PickerStub),
  '@/components/desktop/NewBucketDialog.vue': moduleDefault(NewBucketStub),
  '@/composables/useRealmNodes': {
    useRealmNodes: () => ({
      nodeById: (id: string) => (id === 'node-1' ? realmNode : null),
      displayName: (id: string) => id,
    }),
  },
  '@/composables/useSyncedFolders': { useSyncedFolders: () => ({ bind, busy }) },
  '@/lib/api': { ApiError },
  '@/lib/bucketPlace': BucketPlace,
  '@/lib/utils': Utils,
  '@/lib/desktopBridge': { pickDirectory: vi.fn(async () => '/home/me/data') },
})

const linkButton = (root: Parameters<typeof button>[0]) => button(root, 'Link folder')
// The folder and the bucket, split where the arrow sits.
const summary = (root: Parameters<typeof content>[0]) => {
  const line = element(root, (node) => node.props['data-testid'] === 'link-summary')
  const parts = line.children.map(content).map((text) => text.replace(/\s+/g, ' ').trim()).filter(Boolean)
  return parts.join('|')
}

async function mountReady(props: Record<string, unknown> = {}) {
  const mounted = await mountApp(BindFolderDialog, { props: { open: true, ...props } })
  await click(button(mounted.root, 'Choose'))
  return mounted
}

beforeEach(() => {
  bind.mockReset()
  bind.mockResolvedValue({ folder_id: 'f1' })
  busy.value = false
})

describe('linking a local folder', () => {
  it('links an existing bucket without asking the node to create it', async () => {
    const mounted = await mountReady()

    await click(button(mounted.root, 'Use existing bucket'))
    expect(summary(mounted.root)).toBe('/home/me/data|lab on node-1 · Giessen')
    await click(linkButton(mounted.root))

    expect(bind).toHaveBeenCalledWith(
      expect.objectContaining({
        group_id: 'g1',
        remote: { node_id: 'node-1', bucket: 'lab', prefix: '' },
        create_bucket: false,
      }),
    )
    mounted.app.unmount()
  })

  it('never creates a bucket from a typed name', async () => {
    const mounted = await mountReady()
    await typeValue(input(mounted.root, 'aria-label', 'Bucket'), 'new-bucket')

    expect(linkButton(mounted.root).props.disabled).toBe(true)
    await click(linkButton(mounted.root))

    expect(bind).not.toHaveBeenCalled()
    expect(content(mounted.root)).toContain('Nothing is created unless you choose New bucket.')
    mounted.app.unmount()
  })

  it('creates a bucket only when New bucket asked for it', async () => {
    const mounted = await mountReady()
    await typeValue(input(mounted.root, 'aria-label', 'Bucket'), 'fresh')

    await click(button(mounted.root, 'Ask for a new bucket'))
    expect(content(mounted.root)).toContain('New bucket fresh for link true')
    await click(button(mounted.root, 'Confirm new bucket'))

    expect(summary(mounted.root)).toBe('/home/me/data|fresh on node-1 · Giessen (new)')
    await click(linkButton(mounted.root))
    expect(bind).toHaveBeenCalledWith(
      expect.objectContaining({
        group_id: 'g1',
        remote: { node_id: 'node-1', bucket: 'fresh', prefix: '' },
        create_bucket: true,
        mode: 'two_way',
      }),
    )
    mounted.app.unmount()
  })

  it('shows a group conflict from the node verbatim', async () => {
    const conflict = 'The bucket "lab" already belongs to group g2.'
    bind.mockRejectedValue(new Error(conflict))
    const mounted = await mountReady()
    await click(button(mounted.root, 'Use existing bucket'))

    await click(linkButton(mounted.root))

    expect(content(mounted.root)).toContain(conflict)
    mounted.app.unmount()
  })
})

describe('choosing what the link does', () => {
  const preset = { bucket: 'lab', nodeId: 'node-1', groupId: 'g1' }

  it('keeps a copy by default on a bucket page and never creates the bucket', async () => {
    const mounted = await mountReady(preset)
    const html = content(mounted.root)

    expect(html).toContain('Link a local folder')
    expect(html).toContain('What should happen?')
    expect(html).toContain('Keep a copy here')
    expect(html).toContain('on node-1 · Giessen')
    expect(html).not.toContain('Which node')
    expect(element(mounted.root, (node) => node.props['data-testid'] === 'chosen-bucket')).toBeTruthy()

    await click(linkButton(mounted.root))

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
      ['Send to Aruna', 'upload_only'],
      ['Both ways', 'two_way'],
      ['Keep a copy here', 'download_only'],
    ] as const) {
      bind.mockClear()
      const mounted = await mountReady(preset)
      await click(button(mounted.root, title))
      await click(linkButton(mounted.root))

      expect(bind).toHaveBeenCalledWith(expect.objectContaining({ mode }))
      mounted.app.unmount()
    }
  })

  it('offers a different bucket after Pick another', async () => {
    const mounted = await mountReady(preset)

    await click(button(mounted.root, 'Pick another'))

    expect(() => element(mounted.root, (node) => node.props['data-testid'] === 'chosen-bucket')).toThrow()
    expect(input(mounted.root, 'aria-label', 'Bucket')).toBeTruthy()
    mounted.app.unmount()
  })

  it('needs an existing bucket to keep a copy of', async () => {
    const mounted = await mountReady({ ...preset, newBucket: true })
    await click(button(mounted.root, 'Keep a copy here'))

    expect(content(mounted.root)).toContain('A new bucket is empty')
    await click(linkButton(mounted.root))
    expect(bind).not.toHaveBeenCalled()
    mounted.app.unmount()
  })

  it('says an older node cannot keep a copy yet', async () => {
    bind.mockRejectedValue(
      new ApiError(422, 'unknown variant `download_only`, expected `two_way` or `upload_only`'),
    )
    const mounted = await mountReady(preset)

    await click(linkButton(mounted.root))

    expect(content(mounted.root)).toContain('cannot keep a copy on this computer yet')
    mounted.app.unmount()
  })

  it('shows a 400 about the folder itself instead of blaming the version', async () => {
    bind.mockRejectedValue(new ApiError(400, 'The folder /home/me/data is not empty.'))
    const mounted = await mountReady(preset)

    await click(linkButton(mounted.root))

    expect(content(mounted.root)).toContain('The folder /home/me/data is not empty.')
    expect(content(mounted.root)).not.toContain('cannot keep a copy')
    mounted.app.unmount()
  })

  it('keeps the node refusal verbatim for any other failure', async () => {
    bind.mockRejectedValue(new ApiError(409, 'The folder is not empty.'))
    const mounted = await mountReady(preset)

    await click(linkButton(mounted.root))

    expect(content(mounted.root)).toContain('The folder is not empty.')
    mounted.app.unmount()
  })
})
