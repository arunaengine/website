import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  flush,
  moduleDefault,
  mountApp,
  nodes,
} from '@/test/clientRender'
import * as Api from '@/lib/api'
import * as Utils from '@/lib/utils'
import type { GroupDeletionBlockers } from '@/lib/api'

const getGroupDeletionBlockers = vi.fn<(id: string) => Promise<GroupDeletionBlockers>>()
const deleteGroup = vi.fn<(id: string) => Promise<void>>()
const removeBucket = vi.fn<(nodeId: string, bucket: string) => Promise<void>>()
const writesDisabled = ref(false)

const Passthrough = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const RefreshStub = defineComponent({
  props: { busy: Boolean, label: { type: String, default: '' } },
  setup: (props, { attrs }) => () => h('button', { ...attrs, disabled: props.busy }, props.label),
})
const LinkStub = defineComponent({
  props: { to: { type: Object, required: true } },
  setup: (props, { slots }) => () => h('a', { 'data-to': JSON.stringify(props.to) }, slots.default?.()),
})
const NodeLabelStub = defineComponent({
  props: { nodeId: { type: String, required: true } },
  setup: (props) => () => h('span', `name-${props.nodeId}`),
})
const Empty = defineComponent(() => () => null)
const icons = new Proxy({}, { get: () => Empty })

const DeleteGroupDialog = compileClientComponent(new URL('./DeleteGroupDialog.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: LinkStub },
  '@lucide/vue': icons,
  '@/lib/api': Api,
  '@/lib/utils': Utils,
  '@/lib/connectivity': { OFFLINE_WRITE_HINT: 'offline', useConnectivity: () => ({ writesDisabled }) },
  '@/components/groups/bucketRemoval': { removeBucket },
  '@/composables/useAruna': {
    useAruna: () => ({ getGroupDeletionBlockers, deleteGroup, saving: ref(false) }),
  },
  '@/composables/useRealmNodes': {
    useRealmNodes: () => ({ displayName: (id: string) => `name-${id}`, isLocalNode: (id: string) => id === 'local' }),
  },
  '@/components/ui/Dialog.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogContent.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogHeader.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogTitle.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogDescription.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogFooter.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogClose.vue': moduleDefault(Passthrough),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/NodeLabel.vue': moduleDefault(NodeLabelStub),
  '@/components/ui/Notice.vue': moduleDefault(Passthrough),
  '@/components/ui/RefreshButton.vue': moduleDefault(RefreshStub),
  '@/components/ui/Spinner.vue': moduleDefault(Empty),
})

const BLOCKED: GroupDeletionBlockers = {
  nodes: [
    { node_id: 'remote', kinds: ['metadata documents', 'S3 buckets'], buckets: ['lab-data', 'raw-scans'], more: true },
    { node_id: 'local', kinds: ['S3 buckets'], buckets: ['home'], more: false },
    { node_id: 'quiet', kinds: [], buckets: [], more: false },
    { node_id: 'empty', kinds: [], buckets: [], more: false },
  ],
}
const CLEAR: GroupDeletionBlockers = {
  nodes: [
    { node_id: 'a', kinds: [], buckets: [], more: false },
    { node_id: 'b', kinds: [], buckets: [], more: false },
  ],
}

async function mount() {
  const onDeleted = vi.fn()
  const onOpen = vi.fn()
  const mounted = await mountApp(DeleteGroupDialog, {
    props: { open: true, groupId: 'g1', onDeleted, 'onUpdate:open': onOpen },
  })
  await flush()
  return { ...mounted, onDeleted, onOpen }
}

// Mounts behind a host so the test can close and reopen the dialog.
async function mountToggled() {
  const open = ref(true)
  const Host = defineComponent(() => () => h(DeleteGroupDialog, { open: open.value, groupId: 'g1' }))
  const mounted = await mountApp(Host)
  await flush()
  return { ...mounted, open }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => (resolve = done))
  return { promise, resolve }
}

// Calls the click handler directly, without waiting for a render in between.
function press(node: ReturnType<typeof button>) {
  return (node.props.onClick as () => Promise<void>)()
}

function deleteButton(root: Parameters<typeof nodes>[0]) {
  return button(root, 'Delete group')
}

describe('Delete group dialog', () => {
  beforeEach(() => {
    getGroupDeletionBlockers.mockReset().mockResolvedValue(CLEAR)
    deleteGroup.mockReset().mockResolvedValue(undefined)
    removeBucket.mockReset().mockResolvedValue(undefined)
    writesDisabled.value = false
  })

  it('lists what blocks per node and holds the delete back', async () => {
    getGroupDeletionBlockers.mockResolvedValue(BLOCKED)
    const { root } = await mount()
    const text = content(root)

    expect(getGroupDeletionBlockers).toHaveBeenCalledWith('g1')
    expect(text).toContain('These must be removed before the group can be deleted.')
    expect(text).toContain('metadata documents')
    expect(text).toContain('lab-data')
    expect(text).toContain('raw-scans')
    expect(text).toContain('More buckets are not shown.')
    expect(text).toContain('Nothing left on: name-quiet, name-empty')
    expect(deleteButton(root).props.disabled).toBe(true)
    expect(text).toContain('Remove everything above first.')
  })

  it('links each bucket to the data view of its node and group', async () => {
    getGroupDeletionBlockers.mockResolvedValue(BLOCKED)
    const { root } = await mount()
    const links = nodes(root)
      .filter((node) => node.tag === 'a')
      .map((node) => JSON.parse(String(node.props['data-to'])))

    expect(links).toEqual([
      { name: 'bucket', params: { bucketId: 'lab-data' }, query: { node: 'remote', group: 'g1' } },
      { name: 'bucket', params: { bucketId: 'raw-scans' }, query: { node: 'remote', group: 'g1' } },
      { name: 'bucket', params: { bucketId: 'home' }, query: { group: 'g1' } },
    ])
  })

  it('deletes a blocking bucket on its node after an inline confirmation', async () => {
    getGroupDeletionBlockers.mockResolvedValueOnce(BLOCKED).mockResolvedValueOnce(CLEAR)
    const { root } = await mount()

    await click(element(root, (node) => node.props['aria-label'] === 'Delete lab-data'))
    expect(content(root)).toContain('Delete lab-data and all its files on name-remote? This cannot be undone.')
    expect(removeBucket).not.toHaveBeenCalled()

    await click(element(root, (node) => node.props['aria-label'] === 'Confirm delete lab-data'))
    await flush()

    expect(removeBucket).toHaveBeenCalledWith('remote', 'lab-data')
    expect(getGroupDeletionBlockers).toHaveBeenCalledTimes(2)
    expect(content(root)).toContain('Nothing blocks deletion.')
    expect(deleteButton(root).props.disabled).toBe(false)
  })

  it('names a failed bucket delete and keeps the group delete off', async () => {
    getGroupDeletionBlockers.mockResolvedValue(BLOCKED)
    removeBucket.mockRejectedValueOnce(new Error('bucket is locked'))
    const { root } = await mount()

    await click(element(root, (node) => node.props['aria-label'] === 'Delete home'))
    await click(element(root, (node) => node.props['aria-label'] === 'Confirm delete home'))
    await flush()

    expect(removeBucket).toHaveBeenCalledWith('local', 'home')
    expect(content(root)).toContain('bucket is locked')
    expect(deleteButton(root).props.disabled).toBe(true)
  })

  it('holds the bucket delete back without a connection', async () => {
    getGroupDeletionBlockers.mockResolvedValue(BLOCKED)
    const { root } = await mount()
    await click(element(root, (node) => node.props['aria-label'] === 'Delete home'))
    writesDisabled.value = true
    await flush()
    const confirm = element(root, (node) => node.props['aria-label'] === 'Confirm delete home')

    expect(confirm.props.disabled).toBe(true)
    await press(confirm)
    expect(removeBucket).not.toHaveBeenCalled()
  })

  it('counts the buckets the caller cannot see and blocks on them', async () => {
    getGroupDeletionBlockers.mockResolvedValue({
      nodes: [
        { node_id: 'remote', kinds: ['S3 buckets'], buckets: ['lab-data'], more: false, hidden: 2 },
        { node_id: 'dark', kinds: [], buckets: [], more: false, hidden: 1 },
      ],
    })
    const { root } = await mount()
    const text = content(root)

    expect(text).toContain('2 buckets you cannot access')
    expect(text).toContain('1 bucket you cannot access')
    expect(text).not.toContain('Nothing left on')
    expect(deleteButton(root).props.disabled).toBe(true)
  })

  it('deletes when nothing blocks and tells the page', async () => {
    const { root, onDeleted, onOpen } = await mount()

    expect(content(root)).toContain('Nothing blocks deletion.')
    await click(deleteButton(root))

    expect(deleteGroup).toHaveBeenCalledWith('g1')
    expect(onDeleted).toHaveBeenCalledOnce()
    expect(onOpen).toHaveBeenCalledWith(false)
  })

  it('treats a node that did not answer as unknown', async () => {
    getGroupDeletionBlockers.mockResolvedValue({
      nodes: [
        { node_id: 'a', kinds: [], buckets: [], more: false },
        { node_id: 'down', kinds: [], buckets: [], more: false, error: 'node unreachable' },
      ],
    })
    const { root } = await mount()

    expect(content(root)).toContain('name-down')
    expect(content(root)).toContain('This node did not answer. Check again later.')
    expect(content(root)).not.toContain('Nothing blocks deletion.')
    expect(deleteButton(root).props.disabled).toBe(true)

    getGroupDeletionBlockers.mockResolvedValue(CLEAR)
    await click(button(root, 'Check again'))
    expect(getGroupDeletionBlockers).toHaveBeenCalledTimes(2)
    expect(deleteButton(root).props.disabled).toBe(false)
  })

  it('falls back to a plain delete on a node without the check', async () => {
    getGroupDeletionBlockers.mockRejectedValue(new Api.ApiError(404, 'Not Found'))
    deleteGroup.mockRejectedValueOnce(new Api.ApiError(409, 'group is not empty: node 01NODE: S3 buckets'))
    const { root, onDeleted } = await mount()

    expect(content(root)).toContain('This only works when the group is empty.')
    expect(nodes(root).some((node) => content(node) === 'Check again')).toBe(false)
    await click(deleteButton(root))

    expect(content(root)).toContain('This group still has: S3 buckets.')
    expect(onDeleted).not.toHaveBeenCalled()
  })

  it('shows a refusal after the delete and checks again', async () => {
    deleteGroup.mockRejectedValueOnce(new Api.ApiError(409, 'group is not empty: node 01NODE: S3 buckets'))
    const { root, onDeleted } = await mount()

    getGroupDeletionBlockers.mockResolvedValue(BLOCKED)
    await click(deleteButton(root))
    await flush()

    expect(content(root)).toContain('This group still has: S3 buckets.')
    expect(getGroupDeletionBlockers).toHaveBeenCalledTimes(2)
    expect(content(root)).toContain('lab-data')
    expect(onDeleted).not.toHaveBeenCalled()
  })

  it('names a failed check and keeps the delete off', async () => {
    getGroupDeletionBlockers.mockRejectedValue(new Api.ApiError(503, 'run the deletion check on a server node'))
    const { root } = await mount()

    expect(content(root)).toContain('run the deletion check on a server node')
    expect(deleteButton(root).props.disabled).toBe(true)
  })

  it('keeps the delete off while it runs', async () => {
    const pending = deferred<void>()
    deleteGroup.mockReturnValueOnce(pending.promise)
    const { root, onDeleted } = await mount()

    const running = click(deleteButton(root))
    await flush()
    expect(deleteButton(root).props.disabled).toBe(true)
    await press(deleteButton(root))
    expect(deleteGroup).toHaveBeenCalledTimes(1)

    pending.resolve()
    await running
    expect(onDeleted).toHaveBeenCalledOnce()
  })

  it('starts one delete for a double click', async () => {
    const pending = deferred<void>()
    deleteGroup.mockReturnValueOnce(pending.promise)
    const { root, onDeleted } = await mount()
    const first = press(deleteButton(root))
    const second = press(deleteButton(root))
    pending.resolve()
    await Promise.all([first, second])
    await flush()

    expect(deleteGroup).toHaveBeenCalledTimes(1)
    expect(onDeleted).toHaveBeenCalledOnce()
  })

  it('drops a check that was in flight when the dialog closed', async () => {
    const stale = deferred<GroupDeletionBlockers>()
    getGroupDeletionBlockers.mockReturnValueOnce(stale.promise).mockResolvedValueOnce(BLOCKED)
    const { root, open } = await mountToggled()

    open.value = false
    await flush()
    open.value = true
    await flush()
    stale.resolve(CLEAR)
    await flush()

    expect(getGroupDeletionBlockers).toHaveBeenCalledTimes(2)
    expect(content(root)).toContain('lab-data')
    expect(content(root)).not.toContain('Nothing blocks deletion.')
    expect(deleteButton(root).props.disabled).toBe(true)
  })

  it('drops an older check answer after Check again', async () => {
    const stale = deferred<GroupDeletionBlockers>()
    getGroupDeletionBlockers.mockReturnValueOnce(stale.promise).mockResolvedValueOnce(BLOCKED)
    const { root } = await mount()

    await press(button(root, 'Check again'))
    await flush()
    stale.resolve(CLEAR)
    await flush()

    expect(content(root)).toContain('lab-data')
    expect(content(root)).not.toContain('Nothing blocks deletion.')
    expect(deleteButton(root).props.disabled).toBe(true)
    expect(button(root, 'Check again').props.disabled).toBe(false)
  })

  it('holds the delete back without a connection', async () => {
    writesDisabled.value = true
    const { root } = await mount()

    expect(deleteButton(root).props.disabled).toBe(true)
    expect(deleteButton(root).props.title).toBe('offline')
  })
})
