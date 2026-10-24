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
  input,
  moduleDefault,
  mountApp,
  typeValue,
} from '@/test/clientRender'

const activateContext = vi.fn()
const createBucket = vi.fn()
const apiRequest = vi.fn()
const createRealmBucket = vi.fn()
const device = { baseUrl: 'http://device/api/v1', token: 't' }
const myGroups = ref([{ id: 'g1', name: 'Lab group' }])

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
  '@/composables/useAruna': { useAruna: () => ({ apiBaseUrl: ref('http://device/api/v1'), myGroups }) },
  '@/composables/useDeviceStatus': { useDeviceStatus: () => ({ deviceClient: ref(device) }) },
  '@/composables/useRealmNodes': {
    useRealmNodes: () => ({
      nodes: ref([
        { ...realmNode('device', 'device 12D3…', { kind: 'user', isLocal: true, location: null }) },
        realmNode('node-0', 'node-0', { reachable: false }),
        realmNode('node-1', 'node-1'),
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
