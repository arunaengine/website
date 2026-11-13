import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { click, compileClientComponent, content, element, flush, moduleDefault, mountApp, nodes, typeValue } from '@/test/clientRender'
import * as Api from '@/lib/api'
import * as BucketNaming from '@/lib/bucketNaming'
import * as LinkedFolders from '@/lib/linkedFolders'
import * as Storage from '@/lib/storage'
import * as StorageRules from '@/lib/storageRules'
import * as Utils from '@/lib/utils'
import type { RootsState } from '@/composables/useImportRoots'

const createBackendImport = vi.fn()
const folders = {
  roots: ref<Api.ImportRoot[]>([]),
  state: ref<RootsState>('ready'),
  error: ref<string | null>(null),
  load: vi.fn(),
}
const runBackendImport = vi.fn()
// Per node: its storages and the buckets it holds.
const hostList = ref<{ nodeId: string; kind: string; reachable: boolean; isLocal: boolean }[]>([])
const nodeStores = new Map<string, Api.GroupBackendResponse[]>()
const nodeBuckets = new Map<string, string[]>()
const listGroupBackends = vi.fn(async (_group: string, node: string) => ({ backends: nodeStores.get(node) ?? [] }))
const getBucketRouting = vi.fn(async (bucket: string, node: string) => {
  if (!nodeBuckets.get(node)?.includes(bucket)) throw new Api.ApiError(404, 'no such bucket')
  return { bucket, rules: [], warnings: [] }
})
const nodeClientReady = vi.fn(async (node: string) => ({ baseUrl: `https://${node}`, token: 't' }))
const AddStub = defineComponent({
  props: { open: Boolean, nodeId: String, prefill: Object, rule: String },
  setup: (props) => () =>
    h('aside', { 'data-add': props.open, 'data-node': props.nodeId, 'data-rule': props.rule, 'data-endpoint': (props.prefill as Api.GroupBackendResponse | undefined)?.public_config.endpoint }),
})
const Slot = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const InputStub = defineComponent({
  props: { modelValue: { type: [String, Number], default: '' } },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h('input', { ...attrs, value: props.modelValue, onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value) }),
})
const SelectStub = defineComponent({
  props: { modelValue: { type: String, default: '' }, ariaLabel: String, options: { type: Array, default: () => [] } },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () =>
    h(
      'select',
      { 'aria-label': props.ariaLabel, value: props.modelValue, onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value) },
      (props.options as { value: string; label: string }[]).map((option) => h('option', { value: option.value }, option.label)),
    ),
})

const Dialog = compileClientComponent(new URL('./LinkBucketDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => null) }),
  '@/components/groups/StorageBackendDialog.vue': moduleDefault(AddStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Dialog.vue': moduleDefault(Slot),
  '@/components/ui/DialogClose.vue': moduleDefault(Slot),
  '@/components/ui/DialogContent.vue': moduleDefault(Slot),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slot),
  '@/components/distributed/StorageFeatureLink.vue': moduleDefault(defineComponent(() => () => null)),
  '@/components/ui/DialogFooter.vue': moduleDefault(Slot),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slot),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slot),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(Slot),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/composables/useImportRoots': { useImportRoots: () => folders },
  '@/composables/useAruna': {
    useAruna: () => ({ apiBaseUrl: ref('https://api'), authToken: ref('t'), sessionEpoch: ref(0), nodeClientReady, listGroupBackends, getBucketRouting }),
  },
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ nodes: hostList, displayName: (id: string) => id }) },
  '@/lib/connectivity': { OFFLINE_WRITE_HINT: 'offline', useConnectivity: () => ({ writesDisabled: ref(false) }) },
  '@/lib/api': { ...Api, createBackendImport, runBackendImport },
  '@/lib/bucketNaming': BucketNaming,
  '@/lib/linkedFolders': LinkedFolders,
  '@/lib/storage': Storage,
  '@/lib/storageRules': StorageRules,
  '@/lib/utils': Utils,
})

const SPIRE: Api.GroupBackendResponse = { backend_id: 's1', group_id: 'g1', kind: 's3', name: 'spire', public_config: { endpoint: 'https://s3' } }
const LINKED = { import_id: 'i1', backend_id: 's1', backend_prefix: 'lab-old/', bucket: 'old', key_prefix: '', created_at: '' }
type Root = Parameters<typeof content>[0]
const byId = (root: Root, suffix: string) =>
  element(root, (node) => node.tag === 'input' && String(node.props.id ?? '').endsWith(suffix))
const byLabel = (root: Root, label: string) => element(root, (node) => node.props['aria-label'] === label)
const save = (root: Root) => element(root, (node) => node.tag === 'button' && node.props.type === 'submit')

async function mount(backend: Api.GroupBackendResponse = SPIRE, backends: Api.GroupBackendResponse[] = [SPIRE]) {
  const open = ref(false)
  const events: unknown[] = []
  const mounted = await mountApp(
    defineComponent(() => () =>
      h(Dialog, { open: open.value, groupId: 'g1', backend, backends, links: [LINKED], rule: 'aruna-spire-{bucket}', onSaved: (error?: string) => events.push(error) }),
    ),
  )
  open.value = true
  await flush()
  return { ...mounted, events }
}

async function submit(root: Root) {
  const form = element(root, (node) => node.tag === 'form')
  await (form.props.onSubmit as (event: { preventDefault(): void }) => Promise<void>)({ preventDefault() {} })
  await flush()
}

beforeEach(() => {
  createBackendImport.mockReset().mockResolvedValue({ import_id: 'i2' })
  runBackendImport.mockReset().mockResolvedValue({ job_id: 'j' })
  folders.roots.value = []
  folders.state.value = 'ready'
  folders.error.value = null
  folders.load.mockClear()
  hostList.value = []
  nodeStores.clear()
  nodeBuckets.clear()
  nodeClientReady.mockClear()
})

describe('LinkBucketDialog', () => {
  it('links the S3 bucket to an Aruna bucket of the same name and starts the first sync', async () => {
    const { root, events } = await mount()
    expect(save(root).props.disabled).toBe(true)
    await typeValue(byId(root, '-s3'), 'lab-raw')
    await typeValue(byId(root, '-folder'), 'runs')
    expect(content(root)).toContain('After linking: lab-raw/runs/ ⇆ Aruna bucket lab-raw')
    await submit(root)
    expect(createBackendImport).toHaveBeenCalledWith(
      'g1',
      { backend_id: 's1', backend_prefix: 'lab-raw/runs/', bucket: 'lab-raw', key_prefix: '', write_pattern: '{dir}{name}' },
      expect.anything(),
    )
    expect(runBackendImport).toHaveBeenCalledWith('g1', 'i2', expect.anything())
    expect(events).toEqual([undefined])
  })

  it('refuses an Aruna bucket another link uses', async () => {
    const { root } = await mount()
    await typeValue(byId(root, '-s3'), 'lab-new')
    await typeValue(byId(root, '-aruna'), 'old')
    expect(content(root)).toContain('overlaps')
    expect(save(root).props.disabled).toBe(true)
  })

  it('keeps the link when the first sync does not start', async () => {
    runBackendImport.mockRejectedValue(new Error('busy node'))
    const { root, events } = await mount()
    await typeValue(byId(root, '-s3'), 'lab-raw')
    await submit(root)
    expect(String(events[0])).toContain('Linked, but the first sync did not start')
  })

  describe('local folder', () => {
    const folder = (name: string, root: string): Api.GroupBackendResponse => ({
      backend_id: name,
      group_id: 'g1',
      kind: 'fs',
      name,
      public_config: { root },
    })
    const readOnly = folder('raw', 'projects')
    const others = [
      readOnly,
      SPIRE,
      { ...SPIRE, backend_id: 's2', name: 'removed-s3', disabled: true },
      folder('frozen', 'archive'),
      folder('open-folder', 'scratch'),
      folder('unlisted', 'gone'),
    ]
    const approved = [
      { name: 'projects', writable: false },
      { name: 'archive', writable: false },
      { name: 'scratch', writable: true },
    ]

    it('links a writable folder without asking where to write', async () => {
      folders.roots.value = approved
      const { root } = await mount(folder('open-folder', 'scratch'), others)
      expect(content(root)).toContain('Link a folder')
      expect(() => byLabel(root, 'Write new uploads to')).toThrow()
      await typeValue(byId(root, '-aruna'), 'runs')
      await submit(root)
      expect(createBackendImport.mock.calls[0][1]).not.toHaveProperty('write_backend_id')
    })

    it('needs a writable storage for a read-only folder and offers only those', async () => {
      folders.roots.value = approved
      const { root } = await mount(readOnly, others)
      await typeValue(byId(root, '-aruna'), 'runs')
      expect(content(root)).toContain('This folder is read-only')
      expect(save(root).props.disabled).toBe(true)
      const options = content(byLabel(root, 'Write new uploads to'))
      expect(options).toContain('spire')
      expect(options).toContain('open-folder')
      for (const refused of ['removed-s3', 'frozen', 'unlisted', 'raw']) expect(options).not.toContain(refused)
      await typeValue(byLabel(root, 'Write new uploads to'), 's1')
      expect(save(root).props.disabled).toBe(false)
      await submit(root)
      expect(createBackendImport.mock.calls[0][1]).toMatchObject({ backend_id: 'raw', write_backend_id: 's1' })
    })

    it('says so when no other storage can take the writes', async () => {
      folders.roots.value = approved
      const { root } = await mount(readOnly, [readOnly])
      await typeValue(byId(root, '-aruna'), 'runs')
      expect(content(root)).toContain('Add another storage that takes them first.')
      expect(save(root).props.disabled).toBe(true)
    })

    it('waits for the approved folders and reports a failed read', async () => {
      folders.state.value = 'loading'
      const { root } = await mount(readOnly, others)
      await typeValue(byId(root, '-aruna'), 'runs')
      expect(content(root)).toContain('Loading approved folders…')
      expect(save(root).props.disabled).toBe(true)
      folders.state.value = 'failed'
      folders.error.value = 'node down'
      await flush()
      expect(content(root)).toContain('node down')
      expect(save(root).props.disabled).toBe(true)
      await click(element(root, (node) => node.tag === 'button' && content(node) === 'Try again'))
      expect(folders.load).toHaveBeenCalledTimes(1)
    })

    it('refuses a folder that is no longer approved or has odd names', async () => {
      folders.roots.value = approved
      const { root } = await mount(folder('unlisted', 'gone'), others)
      await typeValue(byId(root, '-aruna'), 'runs')
      expect(content(root)).toContain('The node operator no longer approves this folder.')
      expect(save(root).props.disabled).toBe(true)
      const open = await mount(folder('open-folder', 'scratch'), others)
      await typeValue(byId(open.root, '-aruna'), 'runs')
      await typeValue(byId(open.root, '-folder'), 'a/../b')
      expect(content(open.root)).toContain('Use a relative folder')
      expect(save(open.root).props.disabled).toBe(true)
    })
  })

  describe('node choice', () => {
    const remote = (id: string): Api.GroupBackendResponse => ({ ...SPIRE, backend_id: `r-${id}`, name: 'spire' })
    const radios = (root: Root) => nodes(root).filter((node) => node.tag === 'input' && node.props.type === 'radio')
    const chosen = (root: Root) => radios(root).findIndex((node) => node.props.checked)
    async function answers(root: Root, bucket: string) {
      await typeValue(byId(root, '-aruna'), bucket)
      await vi.advanceTimersByTimeAsync(300)
      await flush()
    }

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      hostList.value = ['node-1', 'node-2', 'node-3'].map((nodeId) => ({ nodeId, kind: 'storage', reachable: true, isLocal: nodeId === 'node-1' }))
    })
    afterEach(() => vi.useRealTimers())

    it('says why a node cannot take the link and offers to add the storage where the bucket is', async () => {
      nodeStores.set('node-1', [SPIRE]).set('node-2', [{ ...SPIRE, backend_id: 'other', public_config: { endpoint: 'https://elsewhere' } }])
      nodeBuckets.set('node-2', ['progenomes'])
      const { root } = await mount()
      await typeValue(byId(root, '-s3'), 'aruna-spire-progenomes')
      await answers(root, 'progenomes')
      const text = content(root)
      expect(text).toContain('Does not hold progenomes')
      expect(text).toContain('No spire storage on this node')
      expect(text).toContain('Does not hold progenomes, no spire storage')
      expect(radios(root).map((node) => node.props.disabled)).toEqual([true, true, true])
      expect(save(root).props.disabled).toBe(true)

      const adds = nodes(root).filter((node) => node.tag === 'button' && content(node).includes('+ Add storage'))
      expect(adds).toHaveLength(1)
      await click(adds[0])
      const dialog = element(root, (node) => node.tag === 'aside')
      expect(dialog.props).toMatchObject({ 'data-add': true, 'data-node': 'node-2', 'data-endpoint': 'https://s3', 'data-rule': 'aruna-spire-{bucket}' })
    })

    it('chooses the one node with both and links there through its own API', async () => {
      nodeStores.set('node-1', [SPIRE]).set('node-2', [remote('2')]).set('node-3', [remote('3')])
      nodeBuckets.set('node-2', ['progenomes'])
      const { root, events } = await mount()
      await typeValue(byId(root, '-s3'), 'aruna-spire-progenomes')
      await answers(root, 'progenomes')
      expect(chosen(root)).toBe(1)
      expect(content(root)).toContain('Holds progenomes and spire storage')
      await submit(root)
      expect(nodeClientReady).toHaveBeenCalledWith('node-2')
      expect(createBackendImport).toHaveBeenCalledWith(
        'g1',
        expect.objectContaining({ backend_id: 'r-2', bucket: 'progenomes' }),
        { baseUrl: 'https://node-2', token: 't' },
      )
      expect(runBackendImport).toHaveBeenCalledWith('g1', 'i2', { baseUrl: 'https://node-2', token: 't' })
      expect(events).toEqual([undefined])
    })

    it('prefers the connected node when several can take the link, and follows a new bucket', async () => {
      nodeStores.set('node-1', [SPIRE]).set('node-2', [remote('2')]).set('node-3', [remote('3')])
      nodeBuckets.set('node-1', ['shared']).set('node-3', ['shared', 'only-three'])
      const { root } = await mount()
      await typeValue(byId(root, '-s3'), 'lab-raw')
      await answers(root, 'shared')
      expect(chosen(root)).toBe(0)
      expect(save(root).props.disabled).toBe(false)
      await answers(root, 'only-three')
      expect(chosen(root)).toBe(2)
    })

    it('keeps a node picked by hand while the next bucket still works there', async () => {
      nodeStores.set('node-1', [SPIRE]).set('node-2', [remote('2')]).set('node-3', [remote('3')])
      nodeBuckets.set('node-1', ['shared', 'next', 'gone']).set('node-3', ['shared', 'next'])
      const { root } = await mount()
      await typeValue(byId(root, '-s3'), 'lab-raw')
      await answers(root, 'shared')
      expect(chosen(root)).toBe(0)
      ;(radios(root)[2].props.onChange as () => void)()
      await flush()
      expect(chosen(root)).toBe(2)
      await answers(root, 'next')
      expect(chosen(root)).toBe(2)
      // A bucket the picked node does not hold falls back to the automatic choice.
      await answers(root, 'gone')
      expect(chosen(root)).toBe(0)
    })
  })
})
