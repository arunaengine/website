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
import type { GroupBackendRequest, GroupBackendResponse, ImportRoot } from '@/lib/api'
import type { RootsState } from '@/composables/useImportRoots'

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
const putGroupRouting = vi.fn(async () => ({}))
// The destination node's new-bucket default and storages, read before a copy is added there.
const getGroupRouting = vi.fn(async (_group: string, _node?: string | null): Promise<object> => ({ group_id: 'g1', warnings: [] }))
const listGroupBackends = vi.fn(async () => ({ backends: [{ ...saved, backend_id: 'old', name: 'lab-old' }] }))
const saving = ref(false)
const folders = {
  roots: ref<ImportRoot[]>([]),
  state: ref<RootsState>('ready'),
  error: ref<string | null>(null),
  load: vi.fn(),
}

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
  '@/composables/useImportRoots': { useImportRoots: () => folders },
  '@/composables/useAruna': {
    useAruna: () => ({
      createGroupBackend,
      replaceGroupBackend,
      disableGroupBackend,
      enableGroupBackend,
      putGroupRouting,
      getGroupRouting,
      listGroupBackends,
      saving,
    }),
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
  '@/components/ui/Spinner.vue': moduleDefault(defineComponent({ props: { label: String }, setup: (p) => () => h('i', p.label) })),
})

type Root = Parameters<typeof content>[0]

const byLabel = (root: Root, label: string) => element(root, (node) => node.props['aria-label'] === label)
const byId = (root: Root, suffix: string) =>
  element(root, (node) => node.tag === 'input' && String(node.props.id ?? '').endsWith(suffix))

async function mount(backend: GroupBackendResponse | null = null, extra: Record<string, unknown> = {}) {
  const open = ref(false)
  const events: unknown[][] = []
  const Host = defineComponent(
    () => () => h(StorageBackendDialog, { open: open.value, groupId: 'g1', backend, onSaved: (...args: unknown[]) => events.push(args), ...extra }),
  )
  const mounted = await mountApp(Host)
  open.value = true
  await flush()
  return { ...mounted, events }
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
    putGroupRouting.mockClear()
    createGroupBackend.mockClear()
    replaceGroupBackend.mockClear()
    disableGroupBackend.mockClear()
    saving.value = false
    folders.roots.value = []
    folders.state.value = 'ready'
    folders.error.value = null
    folders.load.mockClear()
  })

  it('saves a setting without keys, so the stored keys stay', async () => {
    const { root } = await mount(stored)
    expect(nodes(root).some((node) => String(node.props.id ?? '').endsWith('-sec-access_key_id'))).toBe(false)
    await typeValue(byId(root, '-name'), 'lab two')
    expect(save(root).props.disabled).toBe(false)
    await submit(root)
    expect(replaceGroupBackend.mock.calls[0][2]).toMatchObject({
      name: 'lab two',
      public_config: { endpoint: 'https://s3.test', force_path_style: 'true' },
      secret_config: {},
    })
  })

  it('sends the stored cleanup policy back unchanged', async () => {
    const { root } = await mount({ ...stored, cleanup: { mode: 'reclaim', after_secs: 86400 } })
    await typeValue(byId(root, '-name'), 'lab two')
    await submit(root)
    expect(replaceGroupBackend.mock.calls[0][2].cleanup).toEqual({ mode: 'reclaim', after_secs: 86400 })
  })

  it('needs both keys once Replace keys is used', async () => {
    const { root } = await mount(stored)
    await click(buttonWith(root, 'Replace keys'))
    await typeValue(byId(root, '-sec-access_key_id'), 'key')
    expect(save(root).props.disabled).toBe(true)
    await typeValue(byId(root, '-sec-secret_access_key'), 'secret')
    await submit(root)
    expect(replaceGroupBackend.mock.calls[0][2].secret_config).toEqual({ access_key_id: 'key', secret_access_key: 'secret' })
  })

  it('warns only while path-style is off', async () => {
    const { root } = await mount(stored)
    expect(content(root)).not.toContain('Most self-hosted S3 fails without path-style.')
    await click(byLabel(root, 'Path-style addressing'))
    expect(content(root)).toContain('Most self-hosted S3 fails without path-style.')
  })

  it('shows the wait on Remove, not on Save, sends it once and frees it when it fails', async () => {
    let refuse: (err: Error) => void = () => {}
    disableGroupBackend.mockImplementationOnce(() => {
      saving.value = true
      return new Promise<void>((_, reject) => {
        refuse = (err) => {
          saving.value = false
          reject(err)
        }
      })
    })
    const { root } = await mount(stored)
    await click(buttonWith(root, 'Remove storage…'))
    const pending = (buttonWith(root, 'Remove').props.onClick as () => Promise<void>)()
    await flush()
    const remove = buttonWith(root, 'Removing the storage Remove')
    expect(remove.props['aria-busy']).toBe(true)
    expect(remove.props.disabled).toBe(true)
    expect(content(save(root)).trim()).toBe('Save')
    await (remove.props.onClick as () => Promise<void>)()
    expect(disableGroupBackend).toHaveBeenCalledTimes(1)
    refuse(new Error('refused'))
    await pending
    await flush()
    expect(buttonWith(root, 'Remove').props['aria-busy']).toBe(false)
    expect(buttonWith(root, 'Remove').props.disabled).toBe(false)
    expect(content(root)).toContain('refused')
  })

  it('keeps a removal of one storage off the dialog of another opened meanwhile', async () => {
    let finish: () => void = () => {}
    disableGroupBackend.mockImplementationOnce(() => {
      saving.value = true
      return new Promise<void>((resolve) => {
        finish = () => {
          saving.value = false
          resolve()
        }
      })
    })
    const open = ref(true)
    const backend = ref<GroupBackendResponse>(stored)
    const closes: boolean[] = []
    const { root } = await mountApp(
      defineComponent(() => () =>
        h(StorageBackendDialog, {
          open: open.value,
          groupId: 'g1',
          backend: backend.value,
          'onUpdate:open': (value: boolean) => closes.push(value),
        }),
      ),
    )
    await flush()
    await click(buttonWith(root, 'Remove storage…'))
    void (buttonWith(root, 'Remove').props.onClick as () => Promise<void>)()
    await flush()
    open.value = false
    await flush()
    backend.value = { ...saved, backend_id: 'b2', name: 'other', disabled: true }
    open.value = true
    await flush()
    const enable = buttonWith(root, 'Enable storage')
    expect(enable.props['aria-busy']).toBe(false)
    finish()
    await flush()
    expect(closes).toEqual([])
    expect(buttonWith(root, 'Enable storage').props['aria-busy']).toBe(false)
  })

  it('removes the storage after a confirm', async () => {
    const { root } = await mount(stored)
    await click(buttonWith(root, 'Remove storage…'))
    expect(disableGroupBackend).not.toHaveBeenCalled()
    await click(buttonWith(root, 'Remove'))
    expect(disableGroupBackend).toHaveBeenCalledWith('g1', 'b1')
  })

  describe('copy for another node', () => {
    const source: GroupBackendResponse = { ...stored, name: 'spire', backend_id: 'src' }
    async function fillKeys(root: Root) {
      await typeValue(byId(root, '-sec-access_key_id'), 'key')
      await typeValue(byId(root, '-sec-secret_access_key'), 'secret')
    }

    it('starts from the connection, asks for keys again and adds it with the rule on that node', async () => {
      const { root, events } = await mount(null, { prefill: source, nodeId: 'node-2', rule: 'aruna-spire-{bucket}' })
      expect(byId(root, '-name').props.value).toBe('spire')
      expect(byId(root, '-pub-endpoint').props.value).toBe('https://s3.test')
      expect(content(root)).toContain('aruna-spire-{bucket}')
      expect(save(root).props.disabled).toBe(true)
      await fillKeys(root)
      await submit(root)
      expect(createGroupBackend).toHaveBeenCalledWith(
        'g1',
        expect.objectContaining({ name: 'spire', public_config: { endpoint: 'https://s3.test', force_path_style: 'true' } }),
        'node-2',
      )
      expect(putGroupRouting).toHaveBeenCalledWith('g1', { backend_id: 'b1' }, undefined, 'aruna-spire-{bucket}', 'node-2')
      expect(events).toEqual([[saved, undefined]])
    })

    it('locks the type and the fields naming the store to the source, an empty one too', async () => {
      const rooted = { ...source, public_config: { ...source.public_config, root: 'production/' } }
      const { root } = await mount(null, { prefill: rooted, nodeId: 'node-2' })
      expect(byLabel(root, 'Type').props.disabled).toBe(true)
      expect(byId(root, '-pub-root').props).toMatchObject({ value: 'production/', disabled: true })
      expect(byId(root, '-pub-endpoint').props).toMatchObject({ value: 'https://s3.test', disabled: true })
      expect(byId(root, '-pub-region').props.disabled).toBeFalsy()
      await fillKeys(root)
      await submit(root)
      expect(createGroupBackend.mock.calls[0][1].public_config).toEqual({ endpoint: 'https://s3.test', root: 'production/', force_path_style: 'true' })

      const plain = await mount(null, { prefill: source, nodeId: 'node-2' })
      expect(byId(plain.root, '-pub-root').props).toMatchObject({ value: '', disabled: true })
    })

    it('keeps the default of a node that has one unless asked to replace it', async () => {
      getGroupRouting.mockResolvedValue({ group_id: 'g1', default_target: { backend_id: 'old' }, warnings: [] })
      const kept = await mount(null, { prefill: source, nodeId: 'node-2', rule: 'aruna-spire-{bucket}' })
      expect(getGroupRouting).toHaveBeenCalledWith('g1', 'node-2')
      const choice = element(kept.root, (node) => node.tag === 'input' && node.props.type === 'checkbox')
      expect(choice.props.checked).toBe(false)
      const label = content(choice.parent!)
      expect(label).toContain('lab-old')
      expect(label).toContain('spire')
      await fillKeys(kept.root)
      await submit(kept.root)
      expect(createGroupBackend).toHaveBeenCalledTimes(1)
      expect(putGroupRouting).not.toHaveBeenCalled()
      getGroupRouting.mockReset().mockResolvedValue({ group_id: 'g1', warnings: [] })
    })

    it('replaces the default of a node when asked to', async () => {
      getGroupRouting.mockResolvedValue({ group_id: 'g1', default_target: { backend_id: 'old' }, warnings: [] })
      const { root } = await mount(null, { prefill: source, nodeId: 'node-2', rule: 'aruna-spire-{bucket}' })
      await fillKeys(root)
      ;(element(root, (node) => node.tag === 'input' && node.props.type === 'checkbox').props.onChange as () => void)()
      await flush()
      await submit(root)
      expect(putGroupRouting).toHaveBeenCalledWith('g1', { backend_id: 'b1' }, undefined, 'aruna-spire-{bucket}', 'node-2')
      getGroupRouting.mockReset().mockResolvedValue({ group_id: 'g1', warnings: [] })
    })

    it('keeps the added storage when the rule is refused and says so', async () => {
      putGroupRouting.mockRejectedValueOnce(new Error('denied'))
      const { root, events } = await mount(null, { prefill: source, nodeId: 'node-2', rule: 'aruna-spire-{bucket}' })
      await fillKeys(root)
      await submit(root)
      expect(createGroupBackend).toHaveBeenCalledTimes(1)
      expect(String(events[0][1])).toContain('Storage added, but new buckets on this node do not get their own S3 bucket: denied')
    })
  })

  describe('local folder', () => {
    const pick = async (root: Root) => typeValue(byLabel(root, 'Type'), 'fs')
    const approved = [
      { name: 'projects', writable: false },
      { name: 'scratch', writable: true },
    ]

    it('has no credentials and sends the root and folder it was given', async () => {
      folders.roots.value = approved
      const { root } = await mount()
      await pick(root)
      expect(nodes(root).some((node) => node.tag === 'fieldset')).toBe(false)
      expect(content(root)).not.toContain('Aruna checks the keys')
      await typeValue(byId(root, '-name'), 'raw')
      expect(save(root).props.disabled).toBe(true)
      await typeValue(byLabel(root, 'Approved folder'), 'scratch')
      await typeValue(byId(root, '-pub-folder'), 'runs/2026/')
      await submit(root)
      expect(createGroupBackend.mock.calls[0][1]).toEqual({
        name: 'raw',
        kind: 'fs',
        public_config: { root: 'scratch', folder: 'runs/2026/' },
        secret_config: {},
      })
    })

    it('says whether the chosen folder is read-only or writable', async () => {
      folders.roots.value = approved
      const { root } = await mount()
      await pick(root)
      await typeValue(byLabel(root, 'Approved folder'), 'projects')
      expect(content(root)).toContain('Read-only: Aruna can read files here but not write them.')
      await typeValue(byLabel(root, 'Approved folder'), 'scratch')
      expect(content(root)).toContain('Writable: Aruna can read and write files here.')
    })

    it('shows loading, failure with a retry, and the empty list', async () => {
      folders.state.value = 'loading'
      const { root } = await mount()
      await pick(root)
      expect(content(root)).toContain('Loading approved folders…')
      folders.state.value = 'failed'
      folders.error.value = 'node down'
      await flush()
      expect(content(root)).toContain('node down')
      expect(content(root)).not.toContain('has not approved any folders')
      await click(buttonWith(root, 'Try again'))
      expect(folders.load).toHaveBeenCalledTimes(1)
      folders.state.value = 'ready'
      await flush()
      expect(content(root)).toContain('The node operator has not approved any folders for this group.')
    })

    it('refuses a folder the node would refuse', async () => {
      folders.roots.value = approved
      const { root } = await mount()
      await pick(root)
      await typeValue(byId(root, '-name'), 'raw')
      await typeValue(byLabel(root, 'Approved folder'), 'scratch')
      for (const bad of ['runs', '/runs/', 'a//b/', './a/', 'a/../b/']) {
        await typeValue(byId(root, '-pub-folder'), bad)
        expect(save(root).props.disabled).toBe(true)
        expect(content(root)).toMatch(/End the folder with a slash\.|Use a relative folder/)
      }
      await typeValue(byId(root, '-pub-folder'), 'runs/')
      expect(save(root).props.disabled).toBe(false)
    })

    it('does not save a root the list no longer approves', async () => {
      folders.roots.value = approved
      const { root } = await mount()
      await pick(root)
      await typeValue(byId(root, '-name'), 'raw')
      await typeValue(byLabel(root, 'Approved folder'), 'scratch')
      expect(save(root).props.disabled).toBe(false)
      folders.roots.value = [approved[0]]
      await flush()
      expect(save(root).props.disabled).toBe(true)
    })

    it('forgets an S3 root prefix when the type changes to a local folder', async () => {
      folders.roots.value = [{ name: 'aruna/', writable: true }]
      const { root } = await mount()
      await typeValue(byId(root, '-pub-root'), 'aruna/')
      await pick(root)
      expect(byLabel(root, 'Approved folder').props.value).toBe('')
      await typeValue(byId(root, '-name'), 'raw')
      expect(save(root).props.disabled).toBe(true)
    })

    it('keeps the stored root of an edit fixed and keyless', async () => {
      const { root } = await mount({ ...saved, kind: 'fs', public_config: { root: 'gone' } })
      expect(byLabel(root, 'Approved folder').props.disabled).toBe(true)
      expect(content(root)).not.toContain('Replace keys')
      await typeValue(byId(root, '-name'), 'renamed')
      await submit(root)
      expect(replaceGroupBackend.mock.calls[0][2]).toMatchObject({
        kind: 'fs',
        public_config: { root: 'gone' },
        secret_config: {},
      })
    })
  })
})
