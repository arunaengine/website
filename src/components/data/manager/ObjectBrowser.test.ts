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
  debounceHold,
  desktopMode,
  fakeManager,
  listedFolder,
  listedObject,
  lockedCancel,
  lockedDownload,
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
    const name = element(root, (node) => node.tag === 'span' && node.props.title === 'File missing on storage')
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
    ).toEqual(['Preview', 'Download', 'More actions'])
    expect(menuLabels(row)).toEqual(['Details', 'Download', 'Rename', 'Move to', 'Copy to', 'Change access', 'Delete', 'Delete permanently…'])
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

  it('opens the details on the general tab from the menu', async () => {
    openDetails.mockClear()
    const root = await render()

    await click(menuItem(root, 'Details'))

    expect(openDetails).toHaveBeenCalledWith(listedObject)
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
  it('opens the bucket settings from one labelled icon', async () => {
    push.mockClear()
    const root = await render()
    const settings = action(root, 'Bucket settings')

    expect(content(settings).trim()).toBe('')
    await bubbleClick(settings)

    expect(push).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'bucket-storage', params: { bucketId: 'reef' } }),
    )
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

  it('keeps every toolbar label in the desktop and hides them below xl on the web', async () => {
    desktopMode.on = true
    const label = (root: HostNode) => element(action(root, 'Add data'), (node) => node.tag === 'span' && content(node) === 'Add data')
    expect(label(await render()).props.class).toBeFalsy()

    desktopMode.on = false
    expect(label(await render()).props.class).toBe('hidden xl:inline')
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

    for (const text of ['Link a local folder', 'New folder', 'Add data']) {
      expect(String(label(desktop, text).props.class ?? '')).not.toContain('hidden')
    }

    desktopMode.on = false
    const web = await render()
    expect(String(label(web, 'Add data').props.class)).toContain('hidden xl:inline')
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

  it('keeps every list bar action disabled while nothing is ticked', async () => {
    const root = await render({ folders: ref([listedFolder]) })

    for (const label of ['Download', 'Move to', 'Copy to', 'Rename', 'Access', 'Delete']) {
      expect(action(root, label).props.disabled).toBe(true)
    }
  })

  it('renames only one ticked entry and downloads only ticked files', async () => {
    const root = await render({ folders: ref([listedFolder]) })

    await tick(checkbox(root, 'Select genomes'), true)
    expect(action(root, 'Rename').props.disabled).toBe(false)
    expect(action(root, 'Download').props.disabled).toBe(true)

    await tick(checkbox(root, `Select ${listedObject.name}`), true)
    expect(action(root, 'Rename').props.disabled).toBe(true)
    expect(action(root, 'Download').props.disabled).toBe(false)
  })

  it('downloads the ticked files from the list bar', async () => {
    download.mockClear()
    const root = await render()

    await tick(checkbox(root, `Select ${listedObject.name}`), true)
    await click(action(root, 'Download'))

    expect(download).toHaveBeenCalledWith(listedObject)
  })

  it('downloads the ticked files one after another', async () => {
    const second = { ...listedObject, key: 'raw/second.fastq', name: 'second.fastq' }
    const objects = ref([listedObject, second])
    let finish: () => void = () => undefined
    const order: string[] = []
    const slowDownload = vi.fn((object: typeof listedObject) => {
      order.push(object.name)
      return object.key === listedObject.key ? new Promise<void>((resolve) => (finish = resolve)) : Promise.resolve()
    })
    const root = await render({ objects, visibleObjects: objects, download: slowDownload })

    await tick(checkbox(root, `Select ${listedObject.name}`), true)
    await tick(checkbox(root, 'Select second.fastq'), true)
    await click(action(root, 'Download'))
    expect(order).toEqual(['reads.fastq'])

    finish()
    await flush()
    expect(order).toEqual(['reads.fastq', 'second.fastq'])
  })

  it('stops a download batch when the bucket changes', async () => {
    const second = { ...listedObject, key: 'raw/second.fastq', name: 'second.fastq' }
    const objects = ref([listedObject, second])
    const bucket = ref('reef')
    let finish: () => void = () => undefined
    const asked: string[] = []
    const slowDownload = vi.fn((object: typeof listedObject) => {
      asked.push(`${bucket.value}/${object.key}`)
      return object.key === listedObject.key ? new Promise<void>((resolve) => (finish = resolve)) : Promise.resolve()
    })
    const root = await render({ bucket, objects, visibleObjects: objects, download: slowDownload })

    await tick(checkbox(root, `Select ${listedObject.name}`), true)
    await tick(checkbox(root, 'Select second.fastq'), true)
    await click(action(root, 'Download'))
    bucket.value = 'other'
    await flush()
    finish()
    await flush()

    expect(asked).toEqual(['reef/raw/reads.fastq'])
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
    await click(action(root, 'Access'))
    expect(publicAccess).toHaveBeenLastCalledWith([
      { kind: 'folder', bucket: 'reef', key: listedFolder.prefix },
      { kind: 'file', bucket: 'reef', key: listedObject.key },
    ])
  })

  it('clears the ticks from the list bar', async () => {
    const root = await render()

    await tick(checkbox(root, `Select ${listedObject.name}`), true)
    await click(action(root, 'Clear selection'))

    expect(content(root)).toContain('0 selected')
    expect(action(root, 'Delete').props.disabled).toBe(true)
  })

  it('lets the list bar fit a narrow screen', async () => {
    const root = await render()
    const bar = element(root, (node) => String(node.props.class ?? '').includes('h-12'))
    const filter = element(root, (node) => String(node.props.class ?? '').includes('w-52'))

    expect(String(bar.props.class)).toContain('overflow-x-auto')
    expect(String(filter.props.class)).toContain('shrink')
    expect(String(filter.props.class)).not.toContain('shrink-0')
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
  it('turns pages with Prev and Next and sets the page size', async () => {
    const nextPage = vi.fn()
    const previousPage = vi.fn()
    const setPageSize = vi.fn()
    const first = await render({ nextPage, previousPage, setPageSize, nextToken: ref('t2') })

    expect(content(first)).toContain('Page 1')
    expect(button(first, 'Prev').props.disabled).toBe(true)
    await click(button(first, 'Next'))
    expect(nextPage).toHaveBeenCalled()

    const size = element(first, (node) => node.tag === 'select')
    await (size.props.onChange as (event: unknown) => unknown)({ target: { value: '100' } })
    expect(setPageSize).toHaveBeenCalledWith(100)

    const last = await render({ nextPage, previousPage, page: ref(3) })
    expect(content(last)).toContain('Page 3')
    expect(button(last, 'Next').props.disabled).toBe(true)
    await click(button(last, 'Prev'))
    expect(previousPage).toHaveBeenCalled()
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
    expect(button(root, 'Next').props.disabled).toBe(false)
    await click(button(root, 'Next'))
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

    expect(content(element(row, (node) => node.tag === 'td' && content(node).trim() === listedFolder.name))).toBe(` ${listedFolder.name} `)
    expect(menuLabels(row)).toEqual(['Open', 'Details', 'Move to', 'Copy to', 'Change access', 'Delete folder', 'Delete permanently…'])

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
    expect(content(fileRow)).toContain('public')
    expect(content(folderRow)).not.toContain('public')
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
    const field = () => element(root, (node) => node.tag === 'input' && node.props['aria-label'] === 'Filter by name start')
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
