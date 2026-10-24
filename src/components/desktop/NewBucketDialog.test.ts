import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import * as BucketName from '@/lib/bucketName'
import * as BucketPlace from '@/lib/bucketPlace'
import * as Utils from '@/lib/utils'
import * as Workspaces from '@/lib/workspaces'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  flush,
  input,
  moduleDefault,
  mountApp,
  nodes,
  typeValue,
} from '@/test/clientRender'

const activateContext = vi.fn()
const createBucket = vi.fn()
const apiRequest = vi.fn()
const createRealmBucket = vi.fn()
const device = { baseUrl: 'http://device/api/v1', token: 't' }
const myGroups = ref([{ id: 'g1', name: 'Lab group' }])
const sessionEpoch = ref(1)

const Passthrough = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const InputStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h('input', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    }),
})
const RefusalStub = defineComponent({
  props: { message: { type: String, required: true } },
  setup: (props) => () => h('div', props.message),
})
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })
const dialogStubs = Object.fromEntries(
  ['Dialog', 'DialogContent', 'DialogHeader', 'DialogTitle', 'DialogDescription', 'DialogFooter', 'DialogClose'].map(
    (name) => [`@/components/ui/${name}.vue`, moduleDefault(Passthrough)],
  ),
)

const realmNode = (nodeId: string, label: string, extra: Record<string, unknown> = {}) => ({
  nodeId,
  kind: 'server',
  label,
  name: nodeId,
  isLocal: false,
  location: 'Giessen',
  reachable: true,
  apiBase: `https://${nodeId}.example/api/v1`,
  s3Url: null,
  info: null,
  ...extra,
})

const NewBucketDialog = compileClientComponent(new URL('./NewBucketDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': icons,
  ...dialogStubs,
  '@/components/ui/Badge.vue': moduleDefault(Passthrough),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/RefusalNote.vue': moduleDefault(RefusalStub),
  '@/components/ui/Spinner.vue': moduleDefault(defineComponent(() => () => h('i'))),
  '@/components/groups/GroupSelect.vue': moduleDefault(InputStub),
  '@/composables/useAruna': { useAruna: () => ({ apiBaseUrl: ref('http://device/api/v1'), myGroups, sessionEpoch }) },
  '@/composables/useDeviceStatus': { useDeviceStatus: () => ({ deviceClient: ref(device) }) },
  '@/composables/useRealmNodes': {
    useRealmNodes: () => ({
      nodes: ref([
        { ...realmNode('device', 'device 12D3…', { kind: 'user', isLocal: true, location: null }) },
        realmNode('node-0', 'node-0 · Giessen', { reachable: false }),
        realmNode('node-1', 'node-1 · Giessen'),
      ]),
    }),
  },
  '@/composables/useS3': {
    useS3: () => ({ activateContext, createBucket }),
    s3ErrorMessage: (err: Error) => err.message,
  },
  '@/lib/api': { ApiError, apiRequest },
  '@/lib/deviceApi': { createRealmBucket, requireDevice: (client: unknown) => client },
  '@/lib/bucketName': BucketName,
  '@/lib/bucketPlace': BucketPlace,
  '@/lib/desktop': { desktopContext: () => ({ realmUrl: 'https://aruna.example' }) },
  '@/lib/utils': Utils,
  '@/lib/workspaces': Workspaces,
})

const summary = (root: Parameters<typeof content>[0]) =>
  content(element(root, (node) => node.props['data-testid'] === 'new-bucket-summary')).replace(/\s+/g, ' ').trim()

async function mountNamed(props: Record<string, unknown> = {}) {
  const mounted = await mountApp(NewBucketDialog, { props: { open: true, ...props } })
  await typeValue(input(mounted.root, 'aria-label', 'Bucket name'), 'lab-data')
  return mounted
}

beforeEach(() => {
  activateContext.mockReset()
  activateContext.mockImplementation(async (nodeId: string, groupId: string) => ({
    issuerNodeId: nodeId,
    groupId,
    accessKeyId: 'key-1',
  }))
  createBucket.mockReset()
  createBucket.mockResolvedValue(undefined)
  createRealmBucket.mockReset()
  createRealmBucket.mockResolvedValue({ name: 'lab-data', node_id: 'node-1', group_id: 'g1' })
  apiRequest.mockReset()
  apiRequest.mockResolvedValue({ services: { blob: { status: 'ok', backends: [{ quota_bytes: 2048, used_bytes: 1024 }] } } })
})

describe('a new bucket in the desktop', () => {
  it('stores it on the first reachable realm node by default and links it next', async () => {
    const mounted = await mountNamed()

    expect(input(mounted.root, 'aria-label', 'node-1 · Giessen').props.checked).toBe(true)
    expect(input(mounted.root, 'aria-label', 'This computer').props.checked).toBe(false)
    expect(summary(mounted.root)).toBe('Creates lab-data on node-1 · Giessen for Lab group when the folder is linked.')
    expect(content(mounted.root)).toContain('Stays here. No folder link.')
    expect(content(mounted.root)).toContain('1 KB free')

    await click(button(mounted.root, 'Continue'))

    expect(createBucket).not.toHaveBeenCalled()
    expect(activateContext).not.toHaveBeenCalled()
    mounted.app.unmount()
  })

  it('hands the bucket to the link step instead of creating it', async () => {
    const onLink = vi.fn()
    const mounted = await mountNamed({ onLink })

    await click(button(mounted.root, 'Continue'))

    expect(onLink).toHaveBeenCalledWith({ bucket: 'lab-data', nodeId: 'node-1', groupId: 'g1' })
    mounted.app.unmount()
  })

  it('creates it on the chosen realm node through this computer when no folder is linked', async () => {
    const onCreated = vi.fn()
    const mounted = await mountNamed({ onCreated })
    const linkBox = input(mounted.root, 'aria-label', 'Then link a folder on this computer')
    await (linkBox.props.onChange as (event: unknown) => void)({ target: { checked: false } })
    await click(button(mounted.root, 'Create bucket'))

    expect(summary(mounted.root)).toBe('Creates lab-data on node-1 · Giessen for Lab group.')
    expect(createRealmBucket).toHaveBeenCalledWith({ name: 'lab-data', group_id: 'g1', node_id: 'node-1' }, device)
    expect(activateContext).not.toHaveBeenCalled()
    expect(createBucket).not.toHaveBeenCalled()
    expect(onCreated).toHaveBeenCalledWith({ bucket: 'lab-data', nodeId: 'node-1', groupId: 'g1' })
    mounted.app.unmount()
  })

  it('names the place of a bucket that already exists there', async () => {
    createRealmBucket.mockRejectedValue(new ApiError(409, 'bucket lab-data exists', 'bucket_exists'))
    const onCreated = vi.fn()
    const mounted = await mountNamed({ onCreated })
    const linkBox = input(mounted.root, 'aria-label', 'Then link a folder on this computer')
    await (linkBox.props.onChange as (event: unknown) => void)({ target: { checked: false } })
    await click(button(mounted.root, 'Create bucket'))

    expect(content(mounted.root)).toContain('A bucket named lab-data already exists on node-1 · Giessen.')
    expect(onCreated).not.toHaveBeenCalled()
    mounted.app.unmount()
  })

  it('says when the realm node cannot be reached', async () => {
    createRealmBucket.mockRejectedValue(new ApiError(502, 'remote node unreachable'))
    const mounted = await mountNamed()
    const linkBox = input(mounted.root, 'aria-label', 'Then link a folder on this computer')
    await (linkBox.props.onChange as (event: unknown) => void)({ target: { checked: false } })
    await click(button(mounted.root, 'Create bucket'))

    expect(content(mounted.root)).toContain('node-1 · Giessen cannot be reached right now. Try again later.')
    mounted.app.unmount()
  })

  it('keeps a bucket on this computer unlinked', async () => {
    const mounted = await mountNamed()
    const radio = input(mounted.root, 'aria-label', 'This computer')
    await (radio.props.onChange as () => void)()

    const linkBox = input(mounted.root, 'aria-label', 'Then link a folder on this computer')
    expect(linkBox.props.disabled).toBe(true)
    expect(summary(mounted.root)).toBe('Creates lab-data on This computer for Lab group.')

    await click(button(mounted.root, 'Create bucket'))
    expect(activateContext).toHaveBeenCalledWith('device', 'g1')
    expect(createBucket).toHaveBeenCalledWith('lab-data', 'device', { nodeId: 'device', groupId: 'g1', accessKeyId: 'key-1' })
    expect(createRealmBucket).not.toHaveBeenCalled()
    mounted.app.unmount()
  })

  it('offers no bucket on this computer when a folder is linked next', async () => {
    const mounted = await mountNamed({ forLink: true })
    const radio = input(mounted.root, 'aria-label', 'This computer')
    await (radio.props.onChange as () => void)()

    expect(radio.props.disabled).toBe(true)
    expect(input(mounted.root, 'aria-label', 'node-1 · Giessen').props.checked).toBe(true)
    expect(() => input(mounted.root, 'aria-label', 'Then link a folder on this computer')).toThrow()
    mounted.app.unmount()
  })
})

describe('the place table of New bucket', () => {
  it('shows each place by name and its location once', async () => {
    const mounted = await mountApp(NewBucketDialog, { props: { open: true } })
    const row = (label: string) =>
      element(mounted.root, (node) => node.tag === 'tr' && nodes(node).some((child) => child.props['aria-label'] === label))
    const cells = (label: string) =>
      row(label)
        .children.filter((child) => child.tag === 'td')
        .map((cell) => content(cell).trim())

    expect(cells('node-1 · Giessen').slice(1, 3)).toEqual(['node-1 default', 'Giessen'])
    expect(cells('This computer').slice(1, 3)).toEqual(['This computer', 'Not set'])
    mounted.app.unmount()
  })
})

describe('a create that outlives its dialog', () => {
  let finish: (value: unknown) => void = () => {}
  let fail: (error: unknown) => void = () => {}

  // Starts a create on a realm node that answers only when the test says so.
  async function startCreate(onCreated: () => void) {
    createRealmBucket.mockImplementation(
      () => new Promise((resolve, reject) => ((finish = resolve), (fail = reject))),
    )
    const open = ref(true)
    const host = defineComponent({
      setup: () => () =>
        h(NewBucketDialog, { open: open.value, onCreated, 'onUpdate:open': (value: boolean) => (open.value = value) }),
    })
    const mounted = await mountApp(host)
    await typeValue(input(mounted.root, 'aria-label', 'Bucket name'), 'lab-data')
    const linkBox = input(mounted.root, 'aria-label', 'Then link a folder on this computer')
    await (linkBox.props.onChange as (event: unknown) => void)({ target: { checked: false } })
    void click(button(mounted.root, 'Create bucket'))
    await flush()
    return { mounted, open }
  }

  async function reopen(open: { value: boolean }, root: Parameters<typeof input>[0]) {
    open.value = false
    await flush()
    open.value = true
    await flush()
    await typeValue(input(root, 'aria-label', 'Bucket name'), 'other-data')
  }

  it('keeps an old success from closing or moving the new draft', async () => {
    const onCreated = vi.fn()
    const { mounted, open } = await startCreate(onCreated)
    await reopen(open, mounted.root)

    finish({ name: 'lab-data', node_id: 'node-1', group_id: 'g1' })
    await flush()

    expect(onCreated).not.toHaveBeenCalled()
    expect(open.value).toBe(true)
    expect(input(mounted.root, 'aria-label', 'Bucket name').props.value).toBe('other-data')
    mounted.app.unmount()
  })

  it('keeps an old failure out of the new draft', async () => {
    const { mounted, open } = await startCreate(vi.fn())
    await reopen(open, mounted.root)

    fail(new ApiError(409, 'exists', 'bucket_exists'))
    await flush()

    expect(content(mounted.root)).not.toContain('already exists')
    mounted.app.unmount()
  })

  it('drops a result that arrives for another session', async () => {
    const onCreated = vi.fn()
    const { mounted, open } = await startCreate(onCreated)

    sessionEpoch.value += 1
    finish({ name: 'lab-data', node_id: 'node-1', group_id: 'g1' })
    await flush()

    expect(onCreated).not.toHaveBeenCalled()
    expect(open.value).toBe(true)
    mounted.app.unmount()
  })
})
