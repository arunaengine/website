import { computed, defineComponent, h, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  bubbleClick,
  button,
  click,
  content,
  element,
  flush,
  mountApp,
  nodes,
  type HostNode,
} from '@/test/clientRender'
import {
  brokenFiles,
  bucketSearches,
  bucketUsage,
  folderOrigin,
  debounceHold,
  desktopMode,
  fakeManager,
  listedFolder,
  listedObject,
  lockedCancel,
  lockedDownload,
  lockedLive,
  lockedState,
  objectBrowser,
  resetS3Access,
  s3Access,
} from '@/test/dataManager'

const openDetails = vi.fn()
const download = vi.fn()
const requestDelete = vi.fn()
const push = vi.fn()

const browser = objectBrowser()

async function render(overrides: Record<string, unknown> = {}, listeners: Record<string, unknown> = {}) {
  const manager = fakeManager({ openDetails, download, requestDelete, router: { push }, ...overrides })
  const host = defineComponent({ setup: () => () => h(browser, { manager, ...listeners }) })
  const { root } = await mountApp(host)
  return root
}

function checkbox(root: HostNode, label: string): HostNode {
  return element(root, (node) => node.tag === 'input' && node.props['aria-label'] === label)
}

// The host tree has no DOM, so the change event carries the new state by hand.
async function tick(node: HostNode, checked: boolean) {
  Object.assign(node, { checked })
  const handler = node.props.onChange
  if (typeof handler === 'function') await handler({ target: node })
  await flush()
}

function action(root: HostNode, label: string): HostNode {
  return element(root, (node) => node.props['aria-label'] === label)
}

// The list bar carries a Download too, so row actions are found inside the row.
function rowAction(root: HostNode, label: string, name = 'reads.fastq'): HostNode {
  const row = element(root, (node) => node.tag === 'tr' && content(node).includes(name))
  return action(row, label)
}

function menuItem(root: HostNode, label: string, name = 'reads.fastq'): HostNode {
  const row = element(root, (node) => node.tag === 'tr' && content(node).includes(name))
  return element(row, (node) => node.props.role === 'menuitem' && content(node).trim() === label)
}

function menuLabels(row: HostNode): string[] {
  return nodes(row)
    .filter((node) => node.props.role === 'menuitem')
    .map((node) => content(node).trim())
}

describe('object browser row actions', () => {
  it('shows a broken file in red with the reason', async () => {
    brokenFiles.reasons = { [listedObject.key]: 'File missing on storage' }
    const root = await render()
    const name = element(root, (node) => node.tag === 'button' && node.props.title === 'File missing on storage')
    expect(JSON.stringify(name.props.class)).toContain('text-destructive')
    expect(content(name)).toContain('reads.fastq')
    brokenFiles.reasons = {}
  })

  it('offers preview, download and a menu with every file action', async () => {
    const root = await render()
    const row = element(root, (node) => node.tag === 'tr' && content(node).includes('reads.fastq'))

    expect(
      nodes(row)
        .filter((node) => node.tag === 'button' && node.props['aria-label'])
        .map((node) => String(node.props['aria-label'])),
    ).toEqual(['Preview', 'Download', 'Actions for reads.fastq'])
    expect(menuLabels(row)).toEqual(['Preview', 'Download', 'Rename', 'Share', 'Copy to', 'Move to', 'Copy link for members', 'Make public', 'Delete', 'Delete permanently…'])
    // Icon only: the label is the accessible name, not visible text.
    expect(content(action(root, 'Preview')).trim()).toBe('')
  })

  it('previews without opening the details tabs', async () => {
    openDetails.mockClear()
    const root = await render()

    await bubbleClick(action(root, 'Preview'))

    expect(openDetails).toHaveBeenCalledTimes(1)
    expect(openDetails).toHaveBeenCalledWith(listedObject, 'preview')
  })

  it('starts the download from the row', async () => {
    download.mockClear()
    const root = await render()

    await bubbleClick(rowAction(root, 'Download'))

    expect(download).toHaveBeenCalledWith(listedObject)
  })

  it('reads a file of a bucket locked on the node with the scoped key and marks a waiting key', async () => {
    download.mockClear()
    lockedDownload.mockClear()
    Object.assign(lockedState, { locked: true, available: true, pending: new Set([listedObject.key]) })
    try {
      const root = await render()
      expect(content(root)).toContain('Locked on the node')
      expect(content(root)).toContain('Available to you')
      const row = element(root, (node) => node.tag === 'tr' && content(node).includes('reads.fastq'))
      expect(content(row)).toContain('Key pending')

      await bubbleClick(rowAction(root, 'Download'))

      expect(lockedDownload).toHaveBeenCalledWith(listedObject)
      expect(download).not.toHaveBeenCalled()
    } finally {
      Object.assign(lockedState, { locked: false, available: false, pending: new Set() })
    }
  })

  it('ends a waiting scoped key read when the folder changes', async () => {
    const prefix = ref('raw')
    await render({ prefix })
    lockedCancel.mockClear()

    prefix.value = 'raw/genomes/'
    await flush()

    expect(lockedCancel).toHaveBeenCalledTimes(1)
  })

  it('asks the delete dialog for this object', async () => {
    requestDelete.mockClear()
    openDetails.mockClear()
    const root = await render()

    await click(menuItem(root, 'Delete'))

    expect(openDetails).not.toHaveBeenCalled()
    expect(requestDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'object',
        bucket: 'reef',
        key: listedObject.key,
        headState: 'live',
      }),
    )
  })

  it('asks for a permanent delete from the menu', async () => {
    requestDelete.mockClear()
    const root = await render()

    await click(menuItem(root, 'Delete permanently…'))

    expect(requestDelete).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'object', key: listedObject.key, option: 'delete-permanently' }),
    )
  })

  it('opens the details from the name, and the preview from the menu', async () => {
    openDetails.mockClear()
    const root = await render()

    await bubbleClick(element(root, (node) => node.tag === 'button' && node.props.title === listedObject.name))
    expect(openDetails).toHaveBeenCalledTimes(1)
    expect(openDetails).toHaveBeenCalledWith(listedObject)

    await click(menuItem(root, 'Preview'))
    expect(openDetails).toHaveBeenLastCalledWith(listedObject, 'preview')
  })

  it('keeps the end of a long name whole, so the extension stays in view', async () => {
    const long = { ...listedObject, key: 'raw/GCF_000005845.2_ASM584v2_genomic_vs_my_genome_alignment_minimap2.paf', name: 'GCF_000005845.2_ASM584v2_genomic_vs_my_genome_alignment_minimap2.paf' }
    const objects = ref([long])
    const root = await render({ objects, visibleObjects: objects })
    const name = element(root, (node) => node.tag === 'button' && node.props.title === long.name)
    const [start, end] = name.children.filter((node) => node.tag === 'span')

    expect(content(name)).toBe(long.name)
    expect(String(start.props.class)).toContain('truncate')
    expect(content(end)).toBe('minimap2.paf')
    expect(String(end.props.class)).toContain('shrink-0')
  })

  it('opens the share dialog for a file, a folder and the bucket of an ordinary bucket', async () => {
    const onShareLink = vi.fn()
    const root = await render({ folders: ref([listedFolder]) }, { setId: null, onShareLink })
    const row = element(root, (node) => node.tag === 'tr' && content(node).includes('reads.fastq'))
    expect(menuLabels(row)).toEqual(['Preview', 'Download', 'Rename', 'Share', 'Copy to', 'Move to', 'Copy link for members', 'Make public', 'Delete', 'Delete permanently…'])

    await click(menuItem(root, 'Share'))
    await click(menuItem(root, 'Share', 'genomes'))
    await click(action(root, 'Share bucket'))

    expect(onShareLink.mock.calls.map(([target]) => target)).toEqual([
      { kind: 'object', bucket: 'reef', key: listedObject.key },
      { kind: 'folder', bucket: 'reef', prefix: listedFolder.prefix },
      { kind: 'bucket', bucket: 'reef' },
    ])
  })

  it('says in one line that a distributed bucket has no share links', async () => {
    const root = await render({ folders: ref([listedFolder]) }, { setId: 's1' })
    const reason = 'Share links are not available for distributed buckets yet.'

    for (const name of ['reads.fastq', 'genomes']) {
      expect(menuItem(root, 'Share', name).props.disabled).toBe(true)
      expect(content(element(root, (node) => node.tag === 'tr' && content(node).includes(name)))).toContain(reason)
    }
    expect(nodes(root).some((node) => node.props['aria-label'] === 'Share bucket')).toBe(false)
    const note = element(root, (node) => node.tag === 'span' && content(node).trim() === 'No share links for distributed buckets')
    expect(note.props.title).toBe(reason)
  })

  it('links the realm website from the desktop and names the node that serves the bucket', async () => {
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    vi.stubGlobal('window', { location: { origin: 'tauri://localhost' } })
    const resolve = vi.fn((to: { query: Record<string, string> }) => ({ href: `/app/buckets/reef?${new URLSearchParams(to.query)}` }))
    const realmNodes = { displayName: (id: string) => id, nodeById: () => null, localNodeId: ref('laptop-1') }
    desktopMode.on = true
    try {
      desktopMode.website = 'https://realm.example'
      const root = await render({ router: { push, resolve }, activeGroupId: ref('g1'), realmNodes })
      await click(menuItem(root, 'Copy link for members'))
      expect(writeText).toHaveBeenCalledWith('https://realm.example/app/buckets/reef?prefix=raw&node=laptop-1&group=g1&object=raw%2Freads.fastq')

      writeText.mockClear()
      desktopMode.website = null
      const unknown = await render({ router: { push, resolve }, activeGroupId: ref('g1'), realmNodes })
      await click(menuItem(unknown, 'Copy link for members'))
      expect(writeText).not.toHaveBeenCalled()
      expect(content(unknown)).toContain('No link: the realm website is not known')
    } finally {
      desktopMode.on = false
      desktopMode.website = null
      vi.unstubAllGlobals()
    }
  })

  it('copies a portal link to the file from Share', async () => {
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    vi.stubGlobal('window', { location: { origin: 'https://portal.example' } })
    const resolve = vi.fn((to: { query: Record<string, string> }) => ({ href: `/data/reef?${new URLSearchParams(to.query)}` }))
    try {
      const root = await render({ router: { push, resolve }, activeGroupId: ref('g1') })
      await click(menuItem(root, 'Copy link for members'))

      expect(resolve).toHaveBeenCalledWith({ name: 'bucket', params: { bucketId: 'reef' }, query: { prefix: 'raw', group: 'g1', object: listedObject.key } })
      expect(writeText).toHaveBeenCalledWith('https://portal.example/data/reef?prefix=raw&group=g1&object=raw%2Freads.fastq')
      expect(content(root)).toContain('Link copied')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('blocks rename, move and delete in the menu of a row this session cannot change', async () => {
    s3Access.canWrite = () => false
    try {
      const root = await render()
      expect(menuItem(root, 'Rename').props.disabled).toBe(true)
      expect(menuItem(root, 'Delete').props.disabled).toBe(true)
      expect(menuItem(root, 'Copy to').props.disabled).toBe(false)
    } finally {
      resetS3Access()
    }
  })
})

describe('object browser toolbar', () => {
  it('opens the bucket settings from one labelled button that keeps only its icon on a phone', async () => {
    push.mockClear()
    const root = await render()
    const settings = action(root, 'Bucket settings')

    // The count names the syncs and policies the settings hold, instead of a dot.
    expect(content(settings).trim()).toMatch(/^Settings\d*$/)
    expect(element(settings, (node) => node.tag === 'span').props.class).toBe('@max-[600px]:sr-only')
    await bubbleClick(settings)

    expect(push).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'bucket-storage', params: { bucketId: 'reef' } }),
    )
  })
})

describe('object browser upload', () => {
  const uploadItem = (root: HostNode, label: string) =>
    element(root, (node) => node.props.role === 'menuitem' && content(node).trim() === label)

  it('opens Add data for the open bucket from Add from, on any node', async () => {
    for (const remoteNodeId of [ref(null), ref('store-1')]) {
      const onAddData = vi.fn()
      const root = await render({ remoteNodeId }, { onAddData })
      await click(uploadItem(root, 'Add from…'))
      expect(onAddData).toHaveBeenCalledOnce()
    }
  })

  it('takes files from a picker for a bucket on another node and uploads them there', async () => {
    const onAddData = vi.fn()
    const requestUpload = vi.fn()
    const root = await render({ remoteNodeId: ref('store-1'), requestUpload }, { onAddData })
    const picker = element(root, (node) => node.tag === 'input' && node.props.type === 'file')
    const open = vi.fn()
    Object.assign(picker, { click: open })

    const menu = () => element(root, (node) => 'open' in node.props && content(node).includes('Upload files'))
    ;(menu().props['onUpdate:open'] as (value: boolean) => void)(true)
    await flush()
    expect(menu().props.open).toBe(true)
    await click(uploadItem(root, 'Upload files'))
    expect(open).toHaveBeenCalledOnce()
    expect(onAddData).not.toHaveBeenCalled()
    expect(menu().props.open).toBe(false)

    const file = { name: 'genome.fna', size: 4 }
    const target = { files: [file], value: 'C:\\fakepath\\genome.fna' }
    await (picker.props.onChange as (event: unknown) => void)({ target })
    expect(requestUpload).toHaveBeenCalledWith([file])
    expect(target.value).toBe('')
  })

  it('keeps Upload in place but disabled, with the reason, where the node cannot be browsed', async () => {
    const root = await render({ remoteNodeId: ref('store-1'), remoteBlocked: ref(true) })
    const upload = action(root, 'Upload')
    expect(upload.props.disabled).toBe(true)
    expect(upload.props.title).toBe('This node cannot be browsed from here, so nothing can be added.')
    expect(action(root, 'New folder').props.disabled).toBe(true)
  })
})

describe('object browser link a local folder', () => {
  afterEach(() => resetS3Access())

  it('offers the desktop button next to Add data and asks to bind the bucket', async () => {
    desktopMode.on = true
    const onSyncToComputer = vi.fn()
    const source = { bucket: 'reef', nodeId: 'realm-1', groupId: 'g1' }
    const root = await render(
      { showSyncButton: computed(() => true), currentBindSource: computed(() => source) },
      { onSyncToComputer },
    )

    await bubbleClick(action(root, 'Link a local folder'))

    expect(onSyncToComputer).toHaveBeenCalledWith(source)
  })

  it('keeps every toolbar label in the desktop and keeps only icons on a phone on the web', async () => {
    desktopMode.on = true
    const label = (root: HostNode) => element(action(root, 'New folder'), (node) => node.tag === 'span' && content(node) === 'New folder')
    expect(label(await render()).props.class).toBeFalsy()

    desktopMode.on = false
    expect(label(await render()).props.class).toBe('@max-[600px]:sr-only')
  })

  it('names the file count and size of the bucket and the nodes it syncs with', async () => {
    bucketUsage.value.value = { objects: 16 }
    const relationship = { source: 'arn:aruna:realm:self:s3/reef', target: 'arn:aruna:realm:laptop-1:s3/reef', state: 'enabled', status: { last_synced_at: '2026-01-01T00:00:00Z' } }
    try {
      const root = await render({ syncsForKey: () => [{ relationship, direction: 'outgoing' }] })
      const text = content(root)
      expect(text).toContain('16 files stored')
      expect(text).toContain('Up to date')
      // The bucket header names the partners, each linked to its node page.
      const header = element(root, (node) => node.tag === 'section' && Array.isArray(node.props['synced-with'] ?? node.props.syncedWith))
      expect(header.props['synced-with'] ?? header.props.syncedWith).toEqual([{ id: 'laptop-1', name: 'node laptop-1' }])
    } finally {
      bucketUsage.value.value = null
    }
  })

  it('keeps Upload and New folder usable on a bucket of referenced files and names their source', async () => {
    bucketUsage.value.value = { objects: 3, logical_bytes: 300, referenced_bytes: 300 } as never
    try {
      const root = await render({ referenceStats: computed(() => ({ count: 3, bytes: 300, groups: [{ key: 'ncbi', originNodeId: 'n9' }] })), referenceGroupLabel: () => 'ftp.ncbi.nlm.nih.gov' })
      expect(action(root, 'Upload').props.disabled).toBeFalsy()
      expect(action(root, 'New folder').props.disabled).toBeFalsy()
      expect(content(root)).toContain('Referenced from ftp.ncbi.nlm.nih.gov')
      // The source is a plain link to the node it came from.
      const source = element(root, (node) => content(node).trim() === 'ftp.ncbi.nlm.nih.gov' && Boolean(node.props.to))
      expect(source.props.to).toEqual({ name: 'status', query: { node: 'n9' } })
    } finally {
      bucketUsage.value.value = null
    }
  })

  it('says up to date only once the sync has finished and waits for nothing', async () => {
    const base = { source: 'arn:aruna:realm:self:s3/reef', target: 'arn:aruna:realm:laptop-1:s3/reef', state: 'enabled' }
    const shown = async (relationship: object) => content(await render({ syncsForKey: () => [{ relationship, direction: 'outgoing' }] }))

    expect(await shown({ ...base, status: {} })).toContain('Not synced yet')
    expect(await shown({ ...base, status: { last_synced_at: '2026-01-01T00:00:00Z', awaiting_key: 2 } })).toContain('Waiting for an unlock')
    expect(await shown({ ...base, state: 'detached', status: { last_synced_at: '2026-01-01T00:00:00Z' } })).toContain('Sync detached')
    expect(await shown({ ...base, status: {} })).not.toContain('Up to date')
  })

  it('shows no count while the usage is unknown, never a zero', async () => {
    const root = await render()
    expect(content(root)).not.toContain('files stored')
    expect(content(root)).not.toContain('Up to date')
  })

  it('keeps the button out of the web portal', async () => {
    const root = await render({ showSyncButton: computed(() => true) })

    expect(() => action(root, 'Link a local folder')).toThrow()
  })

  it('keeps the button out for a bucket that is not a confirmed realm source', async () => {
    desktopMode.on = true
    const root = await render({ showSyncButton: computed(() => true), currentBindSource: computed(() => null) })

    expect(() => action(root, 'Link a local folder')).toThrow()
  })

  it('never hides the toolbar labels in the desktop', async () => {
    const label = (root: HostNode, text: string) =>
      element(root, (node) => node.tag === 'span' && content(node).trim() === text)
    desktopMode.on = true
    const source = { bucket: 'reef', nodeId: 'realm-1', groupId: 'g1' }
    const desktop = await render({ currentBindSource: computed(() => source) })

    for (const text of ['Link a local folder', 'New folder', 'Upload']) {
      expect(String(label(desktop, text).props.class ?? '')).not.toContain('hidden')
    }

    desktopMode.on = false
    const web = await render()
    expect(String(label(web, 'New folder').props.class)).toContain('@max-[600px]:sr-only')
    // Upload keeps its word down to 360 px, where the search box needs the room.
    expect(label(action(web, 'Upload'), 'Upload').props.class).toBe('@max-[360px]:sr-only')
  })
})

describe('object browser linked bucket', () => {
  const source = { bucket: 'reef', nodeId: 'realm-1', groupId: 'g1' }
  const linked = {
    folder_id: 'f1',
    root: '/home/me/Documents/test-data',
    remote: { node_id: 'realm-1', bucket: 'reef', prefix: '' },
  }
  const note = (root: HostNode) => element(root, (node) => node.props['data-testid'] === 'linked-folder-note')

  afterEach(() => {
    desktopMode.on = false
  })

  it('names the linked folder and opens it instead of offering a new link', async () => {
    desktopMode.on = true
    const root = await render({
      showSyncButton: computed(() => true),
      currentBindSource: computed(() => source),
      currentLinkedFolder: computed(() => linked),
    })

    expect(content(note(root))).toContain('Linked to test-data.')
    expect(content(note(root))).not.toContain('only')
    expect(content(note(root))).toContain('/home/me/Documents/test-data')
    const open = element(note(root), (node) => node.tag === 'a' && content(node).trim() === 'Open folder')
    expect(open.props.to).toEqual({ name: 'folder', params: { folderId: 'f1' } })
    expect(() => action(root, 'Link a local folder')).toThrow()
  })

  it('names the part of the bucket a prefix link covers', async () => {
    desktopMode.on = true
    for (const prefix of ['2026/run-17', '2026/run-17/']) {
      const root = await render({ currentLinkedFolder: computed(() => ({ ...linked, remote: { ...linked.remote, prefix } })) })

      expect(content(note(root))).toContain('Linked to test-data (only 2026/run-17/).')
    }
  })

  it('also drops the link button when the bucket cannot be browsed', async () => {
    desktopMode.on = true
    const root = await render({
      showSyncButton: computed(() => true),
      currentBindSource: computed(() => source),
      currentLinkedFolder: computed(() => linked),
      remoteNodeId: ref('realm-1'),
      remoteBlocked: computed(() => true),
    })

    expect(content(note(root))).toContain('Linked to test-data.')
    expect(() => button(root, 'Link a local folder')).toThrow()
  })

  it('shows no line on the web', async () => {
    const root = await render({ currentLinkedFolder: computed(() => linked) })

    expect(() => note(root)).toThrow()
  })
})

describe('object browser bucket on this computer', () => {
  const device = { nodeId: 'dev', kind: 'user', label: 'device dev', isLocal: true }
  const realmNodes = {
    displayName: (id: string) => `node ${id}`,
    nodeById: (id: string | null) => (id === 'dev' ? device : null),
    localNodeId: ref('dev'),
  }
  const note = (root: HostNode) => element(root, (node) => node.props['data-testid'] === 'device-bucket-note')

  afterEach(() => {
    desktopMode.on = false
  })

  it('says its files are already here and offers a bucket on a realm node', async () => {
    desktopMode.on = true
    const onNewBucket = vi.fn()
    const root = await render({ realmNodes }, { onNewBucket })

    expect(content(note(root))).toContain('Its files are already here, so there is nothing to link.')
    await bubbleClick(button(note(root), 'New bucket on a realm node'))

    expect(onNewBucket).toHaveBeenCalled()
  })

  it('shows no note for a bucket on a realm node or on the web', async () => {
    desktopMode.on = true
    const remote = await render({ realmNodes, remoteNodeId: ref('realm-1') })
    expect(() => note(remote)).toThrow()

    desktopMode.on = false
    const web = await render({ realmNodes })
    expect(() => note(web)).toThrow()
  })
})

describe('object browser selection', () => {
  afterEach(() => resetS3Access())

  it('offers a labelled checkbox on every folder row', async () => {
    const root = await render({ folders: ref([listedFolder]) })
    const box = checkbox(root, 'Select genomes')

    expect(box.props.type).toBe('checkbox')
    expect(box.props.disabled).toBe(false)
    // Icon-free control: the label is the accessible name, not visible text.
    expect(content(box).trim()).toBe('')
  })

  it('sends the ticked folders and files to the delete dialog', async () => {
    requestDelete.mockClear()
    const root = await render({ folders: ref([listedFolder]) })

    await tick(checkbox(root, 'Select genomes'), true)
    await tick(checkbox(root, `Select ${listedObject.name}`), true)
    const trigger = action(root, 'Delete')

    expect(content(root)).toContain('2 selected')
    expect(trigger.props.disabled).toBe(false)
    await click(trigger)

    expect(requestDelete).toHaveBeenCalledWith({
      kind: 'selection',
      bucket: 'reef',
      nodeId: null,
      keys: [listedObject.key],
      prefixes: [listedFolder.prefix],
    })
  })

  it('refuses ticks while a page loads', async () => {
    const root = await render({ folders: ref([listedFolder]), listLoading: ref(true) })

    expect(checkbox(root, 'Select genomes').props.disabled).toBe(true)
    expect(checkbox(root, `Select ${listedObject.name}`).props.disabled).toBe(true)
    expect(checkbox(root, 'Select all listed folders and files').props.disabled).toBe(true)
  })

  it('refuses to tick a folder this session cannot delete', async () => {
    s3Access.canDeletePrefix = () => false
    const root = await render({ folders: ref([listedFolder]) })
    const box = checkbox(root, 'Select genomes')

    expect(box.props.disabled).toBe(true)
    expect(box.props.title).toContain('cannot delete this entire folder')
  })

  it('shows the column header until a row is ticked, then the selection actions in its place', async () => {
    const root = await render({ folders: ref([listedFolder]) })
    const header = () => element(root, (node) => node.tag === 'thead')
    expect(content(header())).toContain('Name')
    expect(() => action(header(), 'Delete')).toThrow()

    await tick(checkbox(root, 'Select genomes'), true)
    expect(content(header())).not.toContain('Name')
    expect(content(header())).toContain('1 selected')
    for (const label of ['Download as ZIP', 'Copy to', 'Move to', 'Make public', 'Delete']) expect(() => action(header(), label)).not.toThrow()
    // A folder downloads as a ZIP; one file alone downloads directly.
    expect(() => action(header(), 'Download')).toThrow()
    await tick(checkbox(root, 'Select genomes'), false)
    await tick(checkbox(root, `Select ${listedObject.name}`), true)
    expect(() => action(header(), 'Download as ZIP')).toThrow()
    expect(action(header(), 'Download').props.disabled).toBe(false)
  })

  it('keeps one select-all box, partly ticked while only some rows are', async () => {
    const root = await render({ folders: ref([listedFolder]), someListedSelected: ref(true), allListedSelected: ref(false), selectedCount: ref(1) })
    const header = element(root, (node) => node.tag === 'thead')
    const all = nodes(header).filter((node) => node.tag === 'input' && node.props['aria-label'] === 'Select all listed folders and files')
    expect(all).toHaveLength(1)
    expect(all[0].props.indeterminate).toBe(true)
  })

  it('offers the selection as one row of icons above the phone navigation', async () => {
    const root = await render()
    await tick(checkbox(root, `Select ${listedObject.name}`), true)
    const bar = element(root, (node) => node.props['aria-label'] === 'Selected files')

    expect(String(bar.props.class)).toContain('hidden @max-[600px]:flex')
    expect(String(bar.props.class)).toContain('max-md:fixed max-md:inset-x-0')
    expect(content(bar)).toContain('1 selected')
    const labels = nodes(bar).filter((node) => node.tag === 'button' && node.props['aria-label']).map((node) => String(node.props['aria-label']))
    expect(labels).toEqual(['Download', 'Copy or move', 'Make public', 'Delete', 'Clear selection'])
    // Copy and move share one button; both stay in its menu.
    expect(content(bar)).toContain('Copy to')
    expect(content(bar)).toContain('Move to')
    expect(String(element(root, (node) => node.tag === 'thead').props.class)).toContain('@max-[600px]:hidden')
  })

  it('downloads the ticked files from the list bar', async () => {
    download.mockClear()
    const root = await render()

    await tick(checkbox(root, `Select ${listedObject.name}`), true)
    await click(action(root, 'Download'))

    expect(download).toHaveBeenCalledWith(listedObject)
  })

  it('opens the ZIP dialog with the ticked folders and files of this bucket', async () => {
    download.mockClear()
    const root = await render({ folders: ref([listedFolder]) })
    await tick(checkbox(root, 'Select genomes'), true)
    await tick(checkbox(root, `Select ${listedObject.name}`), true)
    const dialog = () => element(root, (node) => node.tag === 'dialog')
    expect(dialog().props.open).toBe(false)

    await click(action(element(root, (node) => node.tag === 'thead'), 'Download as ZIP'))

    expect(dialog().props).toMatchObject({ open: true, bucket: 'reef', 'node-id': null, folders: [listedFolder], files: [listedObject], distributed: false })
    expect(download).not.toHaveBeenCalled()
  })

  it('shows where the ZIP went and keeps the ticks', async () => {
    const root = await render({ folders: ref([listedFolder]) })
    await tick(checkbox(root, 'Select genomes'), true)
    await click(action(element(root, (node) => node.tag === 'thead'), 'Download as ZIP'))

    await (element(root, (node) => node.tag === 'dialog').props.onStarted as () => void)()
    await flush()

    expect(content(element(root, (node) => node.tag === 'thead'))).toContain("1 selectedDownload as ZIPSee your browser's downloads")
  })

  it('closes the ZIP dialog when the bucket changes', async () => {
    const bucket = ref('reef')
    const root = await render({ bucket, folders: ref([listedFolder]) })
    await tick(checkbox(root, 'Select genomes'), true)
    await click(action(element(root, (node) => node.tag === 'thead'), 'Download as ZIP'))

    bucket.value = 'other'
    await flush()

    expect(element(root, (node) => node.tag === 'dialog').props.open).toBe(false)
  })

  it('offers the ZIP only once the lock state is read, and closes it when the bucket is locked', async () => {
    Object.assign(lockedState, { settled: false })
    try {
      const root = await render({ folders: ref([listedFolder]) })
      const header = () => element(root, (node) => node.tag === 'thead')
      const dialog = () => element(root, (node) => node.tag === 'dialog')
      await tick(checkbox(root, 'Select genomes'), true)
      expect(() => action(header(), 'Download as ZIP')).toThrow()

      lockedLive.statusSettled.value = true
      await flush()
      await click(action(header(), 'Download as ZIP'))
      expect(dialog().props.open).toBe(true)

      // A later read finds the bucket locked on its node: the open dialog closes, the action goes.
      lockedLive.lockedOnNode.value = true
      await flush()
      expect(dialog().props.open).toBe(false)
      expect(() => action(header(), 'Download as ZIP')).toThrow()
    } finally {
      Object.assign(lockedState, { settled: true })
    }
  })

  it('leaves the ZIP out of a bucket locked on the node', async () => {
    Object.assign(lockedState, { locked: true })
    try {
      const root = await render({ folders: ref([listedFolder]) })
      const header = () => element(root, (node) => node.tag === 'thead')
      await tick(checkbox(root, 'Select genomes'), true)
      await tick(checkbox(root, `Select ${listedObject.name}`), true)

      expect(() => action(header(), 'Download as ZIP')).toThrow()
      expect(() => action(header(), 'Download')).toThrow()
      await tick(checkbox(root, 'Select genomes'), false)
      expect(() => action(header(), 'Download')).not.toThrow()
    } finally {
      Object.assign(lockedState, { locked: false })
    }
  })

  it('retries a partial move with only the items still in place', async () => {
    const root = await render({ folders: ref([listedFolder]) })
    await tick(checkbox(root, 'Select genomes'), true)
    await tick(checkbox(root, `Select ${listedObject.name}`), true)
    await click(action(root, 'Move to'))
    const dialog = element(root, (node) => node.tag === 'aside' && typeof node.props.onDone === 'function')
    expect(dialog.props.sources).toHaveLength(2)

    await (dialog.props.onDone as (moved: string[]) => unknown)([listedObject.key])
    await flush()

    const retry = element(root, (node) => node.tag === 'aside' && typeof node.props.onDone === 'function')
    expect(retry.props.sources).toEqual([{ key: listedFolder.prefix, folder: true }])
    expect(content(root)).toContain('1 selected')
  })

  it('asks public access for the ticked entries', async () => {
    const publicAccess = vi.fn()
    const manager = fakeManager({ openDetails, download, requestDelete, router: { push }, folders: ref([listedFolder]) })
    const host = defineComponent({ setup: () => () => h(browser, { manager, onPublicAccess: publicAccess }) })
    const { root } = await mountApp(host)

    await tick(checkbox(root, `Select ${listedObject.name}`), true)
    await tick(checkbox(root, `Select ${listedFolder.name}`), true)
    await click(action(element(root, (node) => node.tag === 'thead'), 'Make public'))
    expect(publicAccess).toHaveBeenLastCalledWith([
      { kind: 'folder', bucket: 'reef', key: listedFolder.prefix },
      { kind: 'file', bucket: 'reef', key: listedObject.key },
    ])
  })

  it('clears the ticks and brings the column header back', async () => {
    const root = await render()

    await tick(checkbox(root, `Select ${listedObject.name}`), true)
    await click(button(element(root, (node) => node.tag === 'thead'), 'Clear'))

    expect(content(root)).not.toContain('selected')
    expect(content(element(root, (node) => node.tag === 'thead'))).toContain('Name')
  })

  it('offers no links for ticked entries, only the other selection actions', async () => {
    const root = await render({ folders: ref([listedFolder]) })
    await tick(checkbox(root, 'Select genomes'), true)
    await tick(checkbox(root, `Select ${listedObject.name}`), true)
    const head = element(root, (node) => node.tag === 'thead')

    const labels = nodes(head).map((node) => String(node.props['aria-label'] ?? '')).filter(Boolean)
    expect(labels).toEqual(expect.arrayContaining(['Download as ZIP', 'Copy to', 'Move to', 'Make public', 'Delete']))
    expect(labels).not.toContain('Share')
    expect(content(head)).not.toContain('Copy links')
  })

  it('lets the toolbar wrap on a narrow screen with the search box taking the free width', async () => {
    const root = await render()
    const form = element(root, (node) => node.tag === 'form')
    const tools = form.parent!.parent!

    expect(String(form.props.class)).toContain('min-w-[5.5rem] flex-1')
    expect(String(tools.props.class)).toContain('min-w-[min(100%,300px)] flex-1')
    expect(String(tools.parent!.props.class)).toContain('flex-wrap')
  })

  it('fits a 320 px phone: no page size, one borderless menu button and a box wide enough for Search', async () => {
    const root = await render({ nextToken: ref('t2') })
    const row = element(root, (node) => node.tag === 'tr' && content(node).includes('reads.fastq'))
    const more = element(row, (node) => node.props['aria-label'] === 'Actions for reads.fastq')

    expect(String(element(root, (node) => node.tag === 'label' && content(node).includes('Rows per page')).props.class)).toContain('@max-[600px]:hidden')
    expect(String(more.props.class)).toContain('@max-[600px]:size-11 @max-[600px]:border-transparent')
    expect(String(element(root, (node) => node.tag === 'form').props.class)).toContain('min-w-[5.5rem]')
  })

  it('shows the search hint as a block under the toolbar on a phone', async () => {
    const root = await render()
    const box = element(root, (node) => node.tag === 'input' && node.props.placeholder === 'Search files')
    ;(element(root, (node) => node.tag === 'form').props.onFocusin as () => void)()
    ;(box.props['onUpdate:modelValue'] as (next: string) => void)('gff')
    await flush()
    const hints = nodes(root).filter((node) => node.props['data-hint'])

    expect(hints).toHaveLength(2)
    expect(String(hints[0].props.class)).toContain('@max-[600px]:hidden')
    expect(String(hints[1].props.class)).toContain('hidden')
    expect(String(hints[1].props.class)).toContain('@max-[600px]:block')
    expect(content(hints[1])).toBe('Filtering raw for gff')
  })

  it('marks the filter button and offers the reset once a filter is set', async () => {
    const resetFilters = vi.fn()
    const plain = await render({ resetFilters })
    expect(button(plain, 'Reset filters').props.disabled).toBe(true)

    const filtered = await render({ resetFilters, showDeleted: ref(true) })
    const reset = button(filtered, 'Reset filters')
    expect(reset.props.disabled).toBe(false)
    await click(reset)
    expect(resetFilters).toHaveBeenCalled()
  })

  it('sets the shown kind from the filter menu', async () => {
    const listShow = ref('all')
    const root = await render({ listShow })

    await click(button(root, 'Folders only'))

    expect(listShow.value).toBe('folders')
  })

  it('lists deleted files between the live ones in key order', async () => {
    const deletedRows = ref([{ key: 'raw/a.txt', name: 'a.txt', markerVersionId: 'm1' }])
    const objects = ref([listedObject, { ...listedObject, key: 'raw/0.txt', name: '0.txt' }])
    const root = await render({ deletedRows, objects, visibleObjects: objects })

    const names = nodes(root)
      .filter((node) => node.tag === 'tr')
      .map((node) => content(node))
      .filter((text) => text.includes('.txt') || text.includes('.fastq'))
      .map((text) => (text.includes('Deleted') ? 'deleted a.txt' : text.includes('0.txt') ? '0.txt' : 'reads.fastq'))
    expect(names).toEqual(['0.txt', 'deleted a.txt', 'reads.fastq'])
  })
})

describe('object browser pages', () => {
  it('turns pages and names the listed range, with the total on the last page', async () => {
    const nextPage = vi.fn()
    const previousPage = vi.fn()
    const setPageSize = vi.fn()
    const two = ref([listedObject, { ...listedObject, key: 'raw/b.fastq', name: 'b.fastq' }])
    const first = await render({ nextPage, previousPage, setPageSize, nextToken: ref('t2'), pageSize: ref(2), objects: two, visibleObjects: two })

    expect(content(first)).toContain('1-2')
    expect(content(first)).not.toContain(' of ')
    expect(action(first, 'Previous page').props.disabled).toBe(true)
    await click(action(first, 'Next page'))
    expect(nextPage).toHaveBeenCalled()

    const size = element(first, (node) => node.tag === 'select')
    await (size.props.onChange as (event: unknown) => unknown)({ target: { value: '100' } })
    expect(setPageSize).toHaveBeenCalledWith(100)

    const last = await render({ nextPage, previousPage, page: ref(3), pageSize: ref(2), objects: two, visibleObjects: two })
    expect(content(last)).toContain('5-6 of 6')
    expect(action(last, 'Next page').props.disabled).toBe(true)
    await click(action(last, 'Previous page'))
    expect(previousPage).toHaveBeenCalled()
  })

  it('shows rows per page and the pager only when there is more than one page', async () => {
    const two = ref([listedObject, { ...listedObject, key: 'raw/b.fastq', name: 'b.fastq' }])
    const one = await render({ pageSize: ref(25), objects: two, visibleObjects: two })
    expect(content(one)).not.toContain('Rows per page')
    expect(nodes(one).some((node) => node.props.label === 'Next page')).toBe(false)

    const more = await render({ nextToken: ref('t2'), pageSize: ref(2), objects: two, visibleObjects: two })
    expect(content(more)).toContain('Rows per page')
    expect(element(more, (node) => node.tag === 'select').props['aria-label']).toBe('Rows per page')
  })
})

describe('object browser file origins', () => {
  const run = { key: 'job:r1', label: 'Annotate my genome with Bakta', to: { name: 'task', params: { taskId: 't1' } }, time: new Date(Date.now() - 2 * 3600_000).toISOString() }
  afterEach(() => {
    folderOrigin.shared.value = null
    folderOrigin.mixed.value = false
    folderOrigin.byKey.value = new Map()
  })

  it('names the run of a file neither above the list nor in a column', async () => {
    folderOrigin.shared.value = run
    folderOrigin.mixed.value = true
    folderOrigin.byKey.value = new Map([[listedObject.key, run]])
    const root = await render({ folders: ref([listedFolder]) })
    const row = element(root, (node) => node.tag === 'tr' && content(node).includes('reads.fastq'))

    expect(content(root)).not.toContain('Annotate my genome with Bakta')
    expect(nodes(root).some((node) => node.tag === 'th' && content(node).includes('Origin'))).toBe(false)
    // Six columns, the empty one taking the spare width of a wide view.
    expect(row.children.filter((node) => node.tag === 'td')).toHaveLength(6)
    const folderRow = element(root, (node) => node.tag === 'tr' && content(node).includes('genomes'))
    expect(folderRow.children.filter((node) => node.tag === 'td')).toHaveLength(6)
  })
})

describe('object browser names', () => {
  it('drops the record folder name the files repeat and keeps the full name in the title', async () => {
    const file = { ...listedObject, key: 'GCF_000005845.2_ASM584v2/GCF_000005845.2_ASM584v2_genomic.fna.gz', name: 'GCF_000005845.2_ASM584v2_genomic.fna.gz' }
    const objects = ref([file])
    const root = await render({ objects, visibleObjects: objects, prefix: ref('GCF_000005845.2_ASM584v2') })
    const name = element(root, (node) => node.tag === 'button' && node.props.title === file.name)

    expect(content(name)).toBe('…_genomic.fna.gz')
  })
})

describe('object browser run filter', () => {
  type Origin = { key: string; label: string; to: { name: string; params: { taskId: string } } | null; time: string }
  const run: Origin = { key: 'job:r1', label: 'Annotate my genome with Bakta', to: { name: 'task', params: { taskId: 't1' } }, time: '2026-02-01T00:00:00Z' }
  const other = { ...listedObject, key: 'raw/notes.txt', name: 'notes.txt' }
  afterEach(() => (folderOrigin.byKey.value = new Map()))

  it('lists only the files of the run, names it, and offers the whole folder back', async () => {
    folderOrigin.byKey.value = new Map([[listedObject.key, run], [other.key, { ...run, key: 'upload', label: 'an upload', to: null }]])
    const objects = ref([listedObject, other])
    push.mockClear()
    const root = await render({ objects, visibleObjects: objects, runFilter: ref('r1'), route: { query: { prefix: 'raw', run: 'r1' } } })
    const text = content(root)

    expect(text).toContain('reads.fastq')
    expect(text).not.toContain('notes.txt')
    expect(text.replace(/\s+/g, ' ')).toContain('Only the results of Annotate my genome with Bakta')
    expect(text).toContain('1 of 2 from this run')
    await click(element(root, (node) => node.tag === 'button' && content(node).includes('Show the whole folder')))
    expect(push).toHaveBeenCalledWith({ query: { prefix: 'raw' } })
  })

  it('keeps the files of other runs out of the selection', async () => {
    folderOrigin.byKey.value = new Map([[listedObject.key, run], [other.key, { ...run, key: 'upload', label: 'an upload', to: null }]])
    const objects = ref([listedObject, other])
    const hiddenObjectKeys = ref<ReadonlySet<string>>(new Set())
    await render({ objects, visibleObjects: objects, hiddenObjectKeys, runFilter: ref('r1'), route: { query: { prefix: 'raw', run: 'r1' } } })

    expect([...hiddenObjectKeys.value]).toEqual([other.key])
  })

  it('keeps files of unknown origin listed and marked', async () => {
    const objects = ref([listedObject, other])
    const hiddenObjectKeys = ref<ReadonlySet<string>>(new Set())
    const root = await render({ objects, visibleObjects: objects, hiddenObjectKeys, runFilter: ref('r1'), route: { query: { prefix: 'raw', run: 'r1' } } })
    const text = content(root)

    expect(text).toContain('reads.fastq')
    expect(text).toContain('notes.txt')
    expect(text).toContain('Origin unknown')
    expect(text).toContain('0 of 2 from this run, 2 of unknown origin')
    expect(hiddenObjectKeys.value.size).toBe(0)
  })
})

describe('object browser order', () => {
  const big = { ...listedObject, key: 'raw/a-big.fastq', name: 'a-big.fastq', size: 9000, lastModified: new Date('2026-01-01T00:00:00Z') }
  const names = (root: HostNode) =>
    nodes(element(root, (node) => node.tag === 'tbody')).filter((node) => node.tag === 'button' && node.props.title?.toString().endsWith('.fastq') && !node.props['aria-label']).map((node) => content(node))

  it('sorts by a column header and turns the order on a second click', async () => {
    const objects = ref([listedObject, big])
    const root = await render({ objects, visibleObjects: objects })
    expect(names(root)).toEqual(['a-big.fastq', 'reads.fastq'])
    const header = (label: string) => element(root, (node) => node.tag === 'th' && content(node).trim() === label)

    await click(element(header('Size'), (node) => node.tag === 'button'))
    expect(header('Size').props['aria-sort']).toBe('descending')
    expect(names(root)).toEqual(['a-big.fastq', 'reads.fastq'])
    await click(element(header('Size'), (node) => node.tag === 'button'))
    expect(names(root)).toEqual(['reads.fastq', 'a-big.fastq'])
    await click(element(header('Name'), (node) => node.tag === 'button'))
    expect(header('Name').props['aria-sort']).toBe('ascending')
  })

  it('names the order on a phone and changes it from one menu', async () => {
    const objects = ref([listedObject, big])
    const root = await render({ objects, visibleObjects: objects })
    const sortButton = () => element(root, (node) => String(node.props['aria-label'] ?? '').startsWith('Sort: '))
    expect(content(sortButton()).trim()).toBe('Name A to Z')
    expect(String(sortButton().parent!.parent!.parent!.props.class)).toContain('hidden px-3 pb-1.5 @max-[600px]:flex')

    await click(element(root, (node) => node.props.role === 'menuitemradio' && content(node).trim() === 'Newest first'))
    expect(content(sortButton()).trim()).toBe('Newest first')
    expect(names(root)).toEqual(['reads.fastq', 'a-big.fastq'])
  })
})

describe('object browser filtered pages', () => {
  it('keeps Next when the kind filter hides the whole page', async () => {
    const nextPage = vi.fn()
    const root = await render({
      nextPage,
      nextToken: ref('t2'),
      visibleObjects: ref([]),
      isEmpty: computed(() => true),
    })

    expect(content(root)).toContain('No matches on this page.')
    expect(action(root, 'Next page').props.disabled).toBe(false)
    await click(action(root, 'Next page'))
    expect(nextPage).toHaveBeenCalled()
  })
})

describe('notebooks in the bucket', () => {
  const notebookObject = {
    key: 'notebooks/counts.ipynb',
    name: 'counts.ipynb',
    size: 1024,
    lastModified: new Date('2026-02-01T00:00:00Z'),
  }

  it('opens notebook details from the Data list', async () => {
    push.mockClear()
    openDetails.mockClear()
    const root = await render({ objects: ref([notebookObject]) })
    const row = element(root, (node) => node.tag === 'tr' && content(node).includes('counts.ipynb'))

    await bubbleClick(row)

    expect(push).not.toHaveBeenCalled()
    expect(openDetails).toHaveBeenCalledWith(notebookObject)
  })

  it('keeps opening every other file in its details', async () => {
    push.mockClear()
    openDetails.mockClear()
    const root = await render()
    const row = element(root, (node) => node.tag === 'tr' && content(node).includes('reads.fastq'))

    await bubbleClick(row)

    expect(openDetails).toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('opens the notebook itself while the notebooks flag is set', async () => {
    push.mockClear()
    openDetails.mockClear()
    const manager = fakeManager({ openDetails, router: { push }, objects: ref([notebookObject, listedObject]) })
    const host = defineComponent({ setup: () => () => h(browser, { manager, notebooks: true }) })
    const { root } = await mountApp(host)

    await bubbleClick(element(root, (node) => node.tag === 'tr' && content(node).includes('counts.ipynb')))
    expect(push).toHaveBeenCalledWith({
      name: 'notebook',
      params: { bucketId: 'reef', key: 'notebooks/counts.ipynb' },
      query: { group: 'g-1' },
    })

    // Everything else keeps its file details, flag or not.
    await bubbleClick(element(root, (node) => node.tag === 'tr' && content(node).includes('reads.fastq')))
    expect(openDetails).toHaveBeenCalledWith(listedObject)
  })

  it('opens a notebook of a bucket on another node on that node', async () => {
    push.mockClear()
    const manager = fakeManager({ openDetails, router: { push }, objects: ref([notebookObject]), remoteNodeId: ref('store-1') })
    const host = defineComponent({ setup: () => () => h(browser, { manager, notebooks: true }) })
    const { root } = await mountApp(host)

    await bubbleClick(element(root, (node) => node.tag === 'tr' && content(node).includes('counts.ipynb')))
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ query: { group: 'g-1', node: 'store-1' } }))
  })

  it('marks notebook rows only while the flag is set', async () => {
    const marked = async (notebooks: boolean) => {
      const manager = fakeManager({ openDetails, router: { push }, objects: ref([notebookObject]) })
      const host = defineComponent({ setup: () => () => h(browser, { manager, notebooks }) })
      const { root } = await mountApp(host)
      return content(root).includes('Notebook')
    }
    expect(await marked(true)).toBe(true)
    expect(await marked(false)).toBe(false)
  })

  it.each([false, true])('offers notebook creation only in Notebooks: notebooks=%s', async (notebooks) => {
    const manager = fakeManager({ openDetails, router: { push } })
    const { root, app } = await mountApp(defineComponent({ setup: () => () => h(browser, { manager, notebooks }) }))
    if (notebooks) expect(button(root, 'New notebook')).toBeTruthy()
    else expect(() => button(root, 'New notebook')).toThrow()
    app.unmount()
  })
})


describe('object browser public access', () => {
  it('opens the same details view for a folder', async () => {
    openDetails.mockClear()
    const root = await render({ folders: ref([listedFolder]) })
    const row = element(root, (node) => node.tag === 'tr' && content(node).includes(listedFolder.name))

    // The folder icon marks it; the name carries no trailing slash, the title keeps it.
    expect(content(element(row, (node) => node.tag === 'button' && node.props.title === `${listedFolder.name}/`))).toBe(listedFolder.name)
    expect(menuLabels(row)).toEqual(['Open', 'Details', 'Rename', 'Share', 'Copy to', 'Move to', 'Make public', 'Delete folder', 'Delete permanently…'])

    await click(menuItem(root, 'Details', `${listedFolder.name}/`))

    expect(openDetails).toHaveBeenCalledWith({ key: listedFolder.prefix, name: `${listedFolder.name}/` })
  })

  it('marks public files and folders', async () => {
    const root = await render({
      folders: ref([listedFolder]),
      publicAccess: {
        isPublic: (_node: string | null, target: { kind: string; key: string }) => target.kind === 'file',
      },
    })

    const fileRow = element(root, (node) => node.tag === 'tr' && content(node).includes(listedObject.name))
    const folderRow = element(root, (node) => node.tag === 'tr' && content(node).includes(listedFolder.name))
    const marked = (row: HostNode) => nodes(row).some((node) => String(node.props.title ?? '').startsWith('Everyone can read'))
    expect(marked(fileRow)).toBe(true)
    expect(marked(folderRow)).toBe(false)
  })

  it('marks a public bucket once in its header, not on its entries', async () => {
    const root = await render({
      folders: ref([listedFolder]),
      publicAccess: { isPublic: () => true },
    })

    const header = element(root, (node) => node.tag === 'section' && 'is-public' in node.props)
    expect(header.props['is-public']).toBe(true)
    const marked = nodes(root).some((node) => String(node.props.title ?? '').startsWith('Everyone can read'))
    expect(marked).toBe(false)
  })
})

describe('object browser name filter', () => {
  afterEach(() => {
    debounceHold.on = false
    debounceHold.queue.length = 0
  })

  it('keeps the typed text while an earlier filter is applied', async () => {
    debounceHold.on = true
    const nameFilter = ref('')
    const root = await render({ nameFilter })
    const field = () => element(root, (node) => node.tag === 'input' && node.props['aria-label'] === 'Filter this folder or search the bucket')
    const type = async (value: string) => {
      ;(field().props['onUpdate:modelValue'] as (value: string) => void)(value)
      await flush()
    }

    await type('a')
    await type('ab')
    const [first] = debounceHold.queue
    first()
    await flush()

    expect(nameFilter.value).toBe('a')
    expect(field().props.modelValue).toBe('ab')
    expect(content(root)).toContain(listedObject.name)

    debounceHold.queue[1]()
    await flush()
    expect(nameFilter.value).toBe('ab')
    expect(field().props.modelValue).toBe('ab')

    nameFilter.value = ''
    await flush()
    expect(field().props.modelValue).toBe('')
  })
})

describe('the one search box', () => {
  async function setup(overrides: Record<string, unknown> = {}) {
    const manager = fakeManager({ openDetails, download, requestDelete, router: { push }, ...overrides })
    const opened: unknown[] = []
    const host = defineComponent({ setup: () => () => h(browser, { manager, 'onOpen-hit': (hit: unknown) => opened.push(hit) }) })
    const { root } = await mountApp(host)
    const box = () => element(root, (node) => node.tag === 'input' && node.props.placeholder === 'Search files')
    const type = async (value: string) => {
      ;(box().props['onUpdate:modelValue'] as (next: string) => void)(value)
      await flush()
    }
    const enter = async () => {
      ;(element(root, (node) => node.tag === 'form').props.onSubmit as (event: Event) => void)({ preventDefault: () => {} } as Event)
      await flush()
    }
    return { root, manager, opened, box, type, enter }
  }

  it('filters this folder while typing, and Enter shows the whole bucket in its place', async () => {
    bucketSearches.count = 0
    const { root, manager, type, enter } = await setup()
    await type('reads')
    expect(manager.nameFilter.value).toBe('reads')
    expect(content(root)).toContain('reads.fastq')
    expect(content(root)).toContain('Search the whole bucket for "reads"')

    await enter()
    expect(content(root)).toContain('whole bucket reef reads')
    expect(() => element(root, (node) => node.tag === 'table')).toThrow()
    // Enter again searches again in the open view.
    await enter()
    expect(bucketSearches.count).toBe(1)
  })

  it('starts the bucket search from the line under the list too, and column=value never filters the folder', async () => {
    const { root, manager, type } = await setup()
    await type('coli species_taxid=562')
    expect(manager.nameFilter.value).toBe('')
    await click(element(root, (node) => node.tag === 'button' && content(node).includes('Search the whole bucket for')))
    expect(content(root)).toContain('whole bucket reef coli species_taxid=562')
  })

  it('goes back to the folder with an empty box, and opening a hit does too', async () => {
    const { root, manager, opened, box, type, enter } = await setup()
    await type('reads')
    await enter()
    await click(button(root, 'Back to folder'))
    expect(element(root, (node) => node.tag === 'table')).toBeTruthy()
    expect(box().props.modelValue).toBe('')
    expect(manager.nameFilter.value).toBe('')

    await type('reads')
    await enter()
    await click(button(root, 'Open hit'))
    expect(opened).toEqual([expect.objectContaining({ key: 'raw/hit.fastq' })])
    expect(element(root, (node) => node.tag === 'table')).toBeTruthy()
  })

  it('has one search box in the list bar and none above it', async () => {
    const { root } = await setup()
    const boxes = nodes(root).filter((node) => node.tag === 'input' && node.props.type !== 'checkbox' && node.props.type !== 'file')
    expect(boxes.map((node) => node.props.placeholder)).toEqual(['Search files'])
  })

  it('hands Enter to the open search even with an empty box, where its chips may stand alone', async () => {
    bucketSearches.count = 0
    const { type, enter } = await setup()
    await type('coli')
    await enter()
    await type('')
    await enter()
    expect(bucketSearches.count).toBe(1)
  })

  it('ends the search and empties the box when the folder changes', async () => {
    const { root, manager, box, type, enter } = await setup()
    await type('reads')
    await enter()
    ;(manager.s3Prefix as { value: string }).value = 'raw/genomes/'
    await flush()

    expect(content(root)).not.toContain('whole bucket')
    expect(element(root, (node) => node.tag === 'table')).toBeTruthy()
    expect(box().props.modelValue).toBe('')
  })

  it('keeps the box and the whole-bucket search when the bucket cannot be listed here', async () => {
    const { root, type, enter } = await setup({ remoteBlocked: ref(true), remoteEndpointMissing: ref(true), remoteNodeId: ref('node-2') })
    expect(content(root)).toContain('browsing is unavailable from this origin')
    expect(() => element(root, (node) => node.tag === 'table')).toThrow()

    await type('coli')
    expect(content(root)).toContain('Search the whole bucket for "coli"')
    await enter()
    expect(content(root)).toContain('whole bucket reef coli')
  })

  it('leaves the search on a click of the breadcrumb of the folder already open', async () => {
    const { root, manager, box, type, enter } = await setup()
    await type('reads')
    await enter()
    // Clicking the current folder changes no prefix; the search must end all the same.
    ;(element(root, (node) => node.tag === 'nav' && typeof node.props.onNavigate === 'function').props.onNavigate as (path: string) => void)('')
    await flush()

    expect(manager.navigateTo).toHaveBeenCalledWith('')
    expect(content(root)).not.toContain('whole bucket')
    expect(element(root, (node) => node.tag === 'table')).toBeTruthy()
    expect(box().props.modelValue).toBe('')
  })
})
