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
const disableGroupBackend = vi.fn(async (_group: string, _id: string) => {})
const enableGroupBackend = vi.fn(async (_group: string, _id: string) => saved)

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
    useAruna: () => ({ createGroupBackend, replaceGroupBackend, disableGroupBackend, enableGroupBackend, saving: ref(false) }),
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

const buttonWith = (root: Root, text: string) =>
  element(root, (node) => node.tag === 'button' && content(node).trim() === text)
const save = (root: Root) => element(root, (node) => node.tag === 'button' && node.props.type === 'submit')
const stored: GroupBackendResponse = {
  ...saved,
  public_config: { endpoint: 'https://s3.test', force_path_style: 'true' },
}

describe('Storage dialog connection', () => {
  beforeEach(() => {
    createGroupBackend.mockClear()
    replaceGroupBackend.mockClear()
    disableGroupBackend.mockClear()
  })

  it('hides the keys until a setting changes, then asks for them', async () => {
    const { root } = await mount(stored)
    expect(content(root)).toContain('Replace keys')
    expect(nodes(root).some((node) => String(node.props.id ?? '').endsWith('-sec-access_key_id'))).toBe(false)

    await typeValue(byId(root, '-name'), 'lab two')
    expect(save(root).props.disabled).toBe(true)
    await typeValue(byId(root, '-sec-access_key_id'), 'key')
    await typeValue(byId(root, '-sec-secret_access_key'), 'secret')
    await submit(root)

    expect(replaceGroupBackend.mock.calls[0][2]).toMatchObject({
      name: 'lab two',
      public_config: { endpoint: 'https://s3.test', force_path_style: 'true' },
    })
  })

  it('warns only while path-style is off', async () => {
    const { root } = await mount(stored)
    expect(content(root)).not.toContain('Most self-hosted S3 fails without path-style.')
    await click(byLabel(root, 'Path-style addressing'))
    expect(content(root)).toContain('Most self-hosted S3 fails without path-style.')
  })

  it('removes the storage after a confirm', async () => {
    const { root } = await mount(stored)
    await click(buttonWith(root, 'Remove storage…'))
    expect(disableGroupBackend).not.toHaveBeenCalled()
    await click(buttonWith(root, 'Remove'))
    expect(disableGroupBackend).toHaveBeenCalledWith('g1', 'b1')
  })
})
