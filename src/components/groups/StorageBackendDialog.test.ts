import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  click,
  compileClientComponent,
  content,
  element,
  flush,
  moduleDefault,
  mountApp,
  nodes,
  typeValue,
} from '@/test/clientRender'
import * as Storage from '@/lib/storage'
import * as Utils from '@/lib/utils'
import type { GroupBackendRequest, GroupBackendResponse } from '@/lib/api'

const saved: GroupBackendResponse = {
  backend_id: 'b1',
  group_id: 'g1',
  kind: 's3',
  name: 'lab',
  public_config: {},
}
const createGroupBackend = vi.fn(async (_group: string, _body: GroupBackendRequest) => saved)
const replaceGroupBackend = vi.fn(async (_group: string, _id: string, _body: GroupBackendRequest) => saved)

const Passthrough = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const Empty = defineComponent(() => () => null)
const icons = new Proxy({}, { get: () => Empty })
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const InputStub = defineComponent({
  props: { modelValue: { type: [String, Number], default: '' } },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h('input', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    }),
})
const SelectStub = defineComponent({
  props: { modelValue: { type: String, default: '' }, ariaLabel: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () =>
    h('select', {
      'aria-label': props.ariaLabel,
      value: props.modelValue,
      onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    }),
})
const SwitchStub = defineComponent({
  props: { checked: Boolean },
  emits: ['update:checked'],
  setup: (props, { attrs, emit }) => () =>
    h('button', { ...attrs, role: 'switch', onClick: () => emit('update:checked', !props.checked) }),
})

const StorageBackendDialog = compileClientComponent(new URL('./StorageBackendDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': icons,
  '@/lib/storage': Storage,
  '@/lib/utils': Utils,
  '@/lib/connectivity': { OFFLINE_WRITE_HINT: 'offline', useConnectivity: () => ({ writesDisabled: ref(false) }) },
  '@/composables/useAruna': {
    useAruna: () => ({ createGroupBackend, replaceGroupBackend, saving: ref(false) }),
  },
  '@/components/ui/Dialog.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogContent.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogHeader.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogTitle.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogDescription.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogFooter.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogClose.vue': moduleDefault(Passthrough),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/components/ui/Switch.vue': moduleDefault(SwitchStub),
  '@/components/ui/Notice.vue': moduleDefault(Passthrough),
})

type Root = Parameters<typeof content>[0]

const byLabel = (root: Root, label: string) => element(root, (node) => node.props['aria-label'] === label)
const byId = (root: Root, suffix: string) =>
  element(root, (node) => node.tag === 'input' && String(node.props.id ?? '').endsWith(suffix))

async function mount(backend: GroupBackendResponse | null = null) {
  const open = ref(false)
  const Host = defineComponent(
    () => () => h(StorageBackendDialog, { open: open.value, groupId: 'g1', backend }),
  )
  const mounted = await mountApp(Host)
  open.value = true
  await flush()
  return mounted
}

async function submit(root: Root) {
  const form = element(root, (node) => node.tag === 'form')
  await (form.props.onSubmit as (event: { preventDefault(): void }) => Promise<void>)({ preventDefault() {} })
  await flush()
}

const toggle = (root: Root) => click(byLabel(root, 'Create a provider bucket for each new bucket'))

describe('Storage dialog provider buckets', () => {
  beforeEach(() => {
    createGroupBackend.mockClear()
    replaceGroupBackend.mockClear()
  })

  it('sends the prefix and the delete choice for a new S3 storage', async () => {
    const { root } = await mount()
    await typeValue(byId(root, '-name'), 'lab')
    await typeValue(byId(root, '-pub-endpoint'), 'https://s3.test')
    await typeValue(byId(root, '-sec-access_key_id'), 'key')
    await typeValue(byId(root, '-sec-secret_access_key'), 'secret')

    expect(content(root)).not.toContain('Name prefix')
    await toggle(root)
    await typeValue(byId(root, '-bucket-prefix'), 'team-a-')
    expect(content(root)).toContain('New bucket results is stored in team-a-results.')
    await typeValue(byLabel(root, 'When a bucket is deleted'), 'delete_empty')
    await submit(root)

    expect(createGroupBackend.mock.calls[0][1].public_config).toEqual({
      endpoint: 'https://s3.test',
      bucket_prefix: 'team-a-',
      bucket_delete: 'delete_empty',
    })
  })

  it('needs a prefix while the toggle is on', async () => {
    const { root } = await mount()
    await typeValue(byId(root, '-name'), 'lab')
    await typeValue(byId(root, '-pub-endpoint'), 'https://s3.test')
    await typeValue(byId(root, '-sec-access_key_id'), 'key')
    await typeValue(byId(root, '-sec-secret_access_key'), 'secret')
    const save = () => element(root, (node) => node.tag === 'button' && node.props.type === 'submit')
    expect(save().props.disabled).toBe(false)

    await toggle(root)
    await typeValue(byId(root, '-bucket-prefix'), '  ')
    expect(content(root)).toContain('Enter a prefix.')
    expect(byId(root, '-bucket-prefix').props.invalid).toBe('error')
    expect(save().props.disabled).toBe(true)
    await submit(root)
    expect(createGroupBackend).not.toHaveBeenCalled()

    await typeValue(byId(root, '-bucket-prefix'), 'team-a-')
    expect(content(root)).not.toContain('Enter a prefix.')
    expect(save().props.disabled).toBe(false)
  })

  it('removes both keys when the toggle goes off', async () => {
    const { root } = await mount({
      ...saved,
      public_config: { endpoint: 'https://s3.test', bucket_prefix: 'team-a-', bucket_delete: 'keep' },
    })
    expect(byId(root, '-bucket-prefix').props.value).toBe('team-a-')

    await toggle(root)
    await typeValue(byId(root, '-sec-access_key_id'), 'key')
    await typeValue(byId(root, '-sec-secret_access_key'), 'secret')
    await submit(root)

    expect(replaceGroupBackend.mock.calls[0][2].public_config).toEqual({ endpoint: 'https://s3.test' })
  })

  it('offers no provider buckets on a storage with a fixed bucket', async () => {
    const { root } = await mount({ ...saved, public_config: { endpoint: 'https://s3.test', bucket: 'fixed' } })

    expect(content(root)).not.toContain('Provider buckets')
    expect(nodes(root).some((node) => node.props['aria-label'] === 'Create a provider bucket for each new bucket')).toBe(false)
  })
})
