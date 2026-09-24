import * as VueRuntime from 'vue'
import { defineComponent, h, reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, flush, input, moduleDefault, mountApp, typeValue } from '@/test/clientRender'
import * as Api from '@/lib/api'
import * as Invenio from '@/lib/invenio'
import * as Utils from '@/lib/utils'

const createRepositoryConnector = vi.fn()
const replaceRepositoryConnector = vi.fn()

const Empty = defineComponent(() => () => null)
const Slot = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const InputStub = defineComponent({
  props: { modelValue: String },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h('input', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    }),
})

const RepositoryDialog = compileClientComponent(new URL('./RepositoryDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/ui/Dialog.vue': moduleDefault(Slot),
  '@/components/ui/DialogContent.vue': moduleDefault(Slot),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slot),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slot),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slot),
  '@/components/ui/DialogFooter.vue': moduleDefault(Slot),
  '@/components/ui/DialogClose.vue': moduleDefault(Slot),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(Slot),
  '@/components/ui/Select.vue': moduleDefault(Empty),
  '@/components/ui/Switch.vue': moduleDefault(Empty),
  '@/composables/useAruna': {
    useAruna: () => ({ apiBaseUrl: ref('https://api.test'), authToken: ref('bearer'), sessionEpoch: ref(0) }),
  },
  '@/lib/connectivity': { OFFLINE_WRITE_HINT: 'offline', useConnectivity: () => ({ writesDisabled: ref(false) }) },
  '@/lib/api': { ...Api, createRepositoryConnector, replaceRepositoryConnector },
  '@/lib/invenio': Invenio,
  '@/lib/utils': Utils,
})

const STORED = {
  connector_id: 'c1', group_id: 'g1', name: 'Zenodo', kind: 'invenio', endpoint: 'https://zenodo.org/api/',
  community: null, has_secret_config: true, created_at: '', updated_at: '',
}

async function mount(connector: unknown = null) {
  const state = reactive({ open: false, groupId: 'g1', connector })
  const mounted = await mountApp(defineComponent(() => () => h(RepositoryDialog, state)))
  state.open = true
  await flush()
  if (mounted.errors.length) throw mounted.errors[0]
  return mounted
}

async function submit(root: Parameters<typeof button>[0]) {
  const handler = findForm(root)?.props.onSubmit
  if (typeof handler === 'function') await handler({ preventDefault() {} })
  await flush()
}

function findForm(root: Parameters<typeof button>[0]): Parameters<typeof button>[0] | null {
  if (root.tag === 'form') return root
  for (const child of root.children) {
    const found = findForm(child)
    if (found) return found
  }
  return null
}

beforeEach(() => {
  createRepositoryConnector.mockReset()
  replaceRepositoryConnector.mockReset()
})

describe('RepositoryDialog', () => {
  it('fills the Zenodo sandbox preset', async () => {
    createRepositoryConnector.mockResolvedValue(STORED)
    const mounted = await mount()
    await click(button(mounted.root, 'Zenodo sandbox'))
    await submit(mounted.root)

    expect(createRepositoryConnector).toHaveBeenCalledWith(
      'g1',
      { name: 'Zenodo sandbox', kind: 'invenio', endpoint: 'https://sandbox.zenodo.org/api/', secret_config: {} },
      expect.anything(),
    )
    mounted.app.unmount()
  })

  it('refuses an endpoint the backend would refuse', async () => {
    const mounted = await mount()
    await typeValue(input(mounted.root, 'placeholder', 'Zenodo'), 'Mine')
    await typeValue(input(mounted.root, 'placeholder', 'https://zenodo.org/api/'), 'http://Repo.example/api/')

    expect(content(mounted.root)).toContain('lowercase')
    expect(button(mounted.root, 'Add repository').props.disabled).toBe(true)
    mounted.app.unmount()
  })

  it('asks for a new token when the endpoint of a stored token changes', async () => {
    const mounted = await mount(STORED)
    await typeValue(input(mounted.root, 'placeholder', 'https://zenodo.org/api/'), 'https://sandbox.zenodo.org/api/')

    expect(content(mounted.root)).toContain('The stored token belongs to the old address')
    expect(button(mounted.root, 'Save changes').props.disabled).toBe(true)
    await typeValue(input(mounted.root, 'aria-label', 'Read token'), 'new-token')
    expect(button(mounted.root, 'Save changes').props.disabled).toBe(false)
    mounted.app.unmount()
  })

  it('asks to enter the token again after a failed save', async () => {
    replaceRepositoryConnector.mockRejectedValue(new Error('refused'))
    const mounted = await mount(STORED)
    await typeValue(input(mounted.root, 'aria-label', 'Read token'), 'new-token')
    await submit(mounted.root)

    expect(content(mounted.root)).toContain('The typed token was cleared, enter it again.')
    expect(input(mounted.root, 'aria-label', 'Read token').props.value).toBe('')
    mounted.app.unmount()
  })
})
