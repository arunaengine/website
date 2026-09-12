import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { button, click, compileClientComponent, content, element, flush, moduleDefault, mountApp, nodes, typeValue, type HostNode } from '@/test/clientRender'

const listScratch = vi.hoisted(() => vi.fn())
vi.mock('@/lib/notebook/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/notebook/session')>()),
  listScratch,
}))

import * as sessionFiles from '@/composables/useSessionFiles'

const LIMIT = 8 * 1024 * 1024
type Entry = { name: string; kind: 'file' | 'dir'; bytes: number; modified_ms: number }
const TREE: Record<string, Entry[]> = {
  '': [
    { name: 'out.txt', kind: 'file', bytes: 12, modified_ms: 0 },
    { name: 'big.bin', kind: 'file', bytes: LIMIT, modified_ms: 0 },
    { name: '.aruna', kind: 'dir', bytes: 0, modified_ms: 0 },
    { name: 'data', kind: 'dir', bytes: 0, modified_ms: 0 },
    { name: 'tmp', kind: 'dir', bytes: 0, modified_ms: 0 },
  ],
  data: [
    { name: 'sub', kind: 'dir', bytes: 0, modified_ms: 0 },
    { name: 'other', kind: 'dir', bytes: 0, modified_ms: 0 },
    { name: '.cache', kind: 'file', bytes: 1, modified_ms: 0 },
  ],
  'data/sub': [
    { name: 'a.csv', kind: 'file', bytes: 5, modified_ms: 0 },
    { name: 'deep', kind: 'dir', bytes: 0, modified_ms: 0 },
  ],
  'data/sub/deep': [{ name: 'z.csv', kind: 'file', bytes: 3, modified_ms: 0 }],
  'data/other': [],
  tmp: [],
}

const Empty = defineComponent(() => () => null)
const Slotted = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const ButtonStub = defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()) })
// A menu item is a button that keeps its disabled state and reason, so a test can read them.
const MenuItem = defineComponent({
  props: ['disabled'], emits: ['select'],
  setup: (props, { attrs, emit, slots }) => () => h('button', { ...attrs, disabled: props.disabled, onClick: () => { if (!props.disabled) emit('select') } }, slots.default?.()),
})
const InputStub = defineComponent({
  props: ['modelValue'], emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () => h('input', { ...attrs, value: props.modelValue, onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value) }),
})

async function render(options: { live?: boolean; running?: boolean; starting?: boolean } = {}) {
  const generation = ref(1)
  const activeCellId = ref('first')
  const noteCellInputs = vi.fn()
  const addSessionInputs = vi.fn()
  const readScratch = vi.fn()
  const s3 = {
    listObjects: vi.fn().mockResolvedValue({ objects: [] }),
    listObjectsRecursive: vi.fn(),
    createFolder: vi.fn().mockResolvedValue(undefined),
    copyObject: vi.fn().mockResolvedValue(undefined),
    deleteObject: vi.fn().mockResolvedValue(undefined),
    deletePrefix: vi.fn().mockResolvedValue({ deleted: 1, errors: [] }),
    uploadObject: vi.fn((_bucket: string, _key: string, _file: File) => ({ promise: Promise.resolve(), abort: vi.fn() })),
  }
  listScratch.mockReset()
  listScratch.mockImplementation(async (_job: string, path: string) => {
    if (options.starting) throw new ApiError(409, 'starting', 'session_starting')
    return { path, entries: TREE[path] ?? [] }
  })
  const textStub = defineComponent({ props: ['title', 'description'], setup: (props) => () => h('p', `${props.title} ${props.description ?? ''}`) })
  const picker = defineComponent({ props: ['destination'], setup: (props, { emit }) => () => h('button', {
    onClick: () => emit('add', { kind: 'file', url: 's3://source/input.txt', name: 'input.txt' }),
  }, `Pick input into ${props.destination}`) })
  const importer = defineComponent({ props: ['open', 'prefix'], setup: (props) => () => props.open ? h('p', `Import into ${props.prefix}`) : null })
  const copyDialog = defineComponent({ props: ['open', 'source', 'count'], emits: ['copy'], setup: (props, { emit }) => () => props.open
    ? h('button', { onClick: () => emit('copy', { bucket: 'dest', prefix: 'out/' }) }, `Copy ${props.count} of ${props.source} to dest`)
    : null })
  // The store derives running from the job id, so a stopped fake has none.
  const session = {
    jobId: ref(options.running === false ? '' : 'job-a'), live: ref(options.live ?? true), running: ref(options.running ?? true), ended: ref(false),
    cellStates: ref({}), client: ref({ baseUrl: '/api/v1' }),
  }
  const modules: Record<string, unknown> = {
    vue: VueRuntime,
    '@lucide/vue': new Proxy({}, { get: () => Empty }),
    '@/composables/notebookContext': { injectNotebook: () => ({
      notebook: { generation, activeCellId, noteCellInputs, meta: ref({ workspace_bucket: 'workspace', group_id: 'group' }) },
      session,
    }) },
    '@/composables/useS3': { useS3: () => s3 },
    '@/composables/useSessionFiles': sessionFiles,
    '@/lib/notebook/session': { addSessionInputs, readScratch, SCRATCH_READ_LIMIT_BYTES: LIMIT },
    '@/lib/notebook/document': { NOTEBOOK_DATA_PREFIX: 'data/' },
    '@/lib/tes': { parseS3Url: () => ({ bucket: 'source', key: 'input.txt' }) },
    '@/lib/utils': { errorMessage: (cause: Error) => cause.message, formatBytes: (bytes: number) => `${bytes} B` },
    '@/components/ui/Button.vue': moduleDefault(ButtonStub),
    '@/components/ui/IconButton.vue': moduleDefault(ButtonStub),
    '@/components/ui/Input.vue': moduleDefault(InputStub),
    '@/components/ui/DropdownMenuItem.vue': moduleDefault(MenuItem),
    '@/components/ui/EmptyState.vue': moduleDefault(textStub),
    '@/components/compute/TesDataRefDialog.vue': moduleDefault(picker),
    '@/components/data/AddDataDialog.vue': moduleDefault(importer),
    '@/components/notebook/NotebookCopyDialog.vue': moduleDefault(copyDialog),
  }
  for (const path of ['ui/Notice', 'ui/Spinner', 'ui/DropdownMenu', 'ui/DropdownMenuContent', 'ui/DropdownMenuTrigger']) {
    modules[`@/components/${path}.vue`] = moduleDefault(Slotted)
  }
  const component = compileClientComponent(new URL('./NotebookFiles.vue', import.meta.url), modules)
  const onStart = vi.fn()
  const onHide = vi.fn()
  const { root, app } = await mountApp(defineComponent({ setup: () => () => h(component, { onStart, onHide }) }))
  await flush()
  return { root, app, generation, activeCellId, noteCellInputs, addSessionInputs, readScratch, s3, session, onStart, onHide }
}

function row(root: HostNode, path: string): HostNode {
  return element(root, (node) => node.props['data-path'] === path)
}

function menuButton(root: HostNode, name: string): HostNode {
  return element(root, (node) => node.props['aria-label'] === `Actions for ${name}`)
}

/** Opens the menu of the row named `name` from its three dots and returns the item `label`. */
async function rowItem(root: HostNode, name: string, label: string): Promise<HostNode> {
  await click(menuButton(root, name))
  return element(root, (node) => node.tag === 'button' && content(node).trim() === label)
}

async function expand(root: HostNode, name: string) {
  await click(element(root, (node) => node.props['aria-label'] === `Expand ${name}`))
}

async function pressEnter(field: HostNode) {
  const handler = field.props.onKeydown
  const listeners = Array.isArray(handler) ? handler : handler ? [handler] : []
  for (const listener of listeners) await listener({ key: 'Enter', preventDefault: () => {}, target: field })
  await flush()
}

async function pressKey(node: HostNode, key: string, keys: Record<string, boolean> = {}) {
  await (node.props.onKeydown as (event: unknown) => void)({ key, target: node, currentTarget: node, preventDefault: vi.fn(), ...keys })
  await flush()
}

type Handler = (event: unknown) => Promise<void> | void
/** A click that holds Shift, Ctrl or Cmd. */
async function clickWith(node: HostNode, keys: Record<string, boolean>) {
  await (node.props.onClick as Handler)({ target: node, ...keys })
  await flush()
}

async function rightClick(node: HostNode) {
  await (node.props.onContextmenu as Handler)({ clientX: 1, clientY: 1, preventDefault: vi.fn() })
  await flush()
}

function selectedPaths(root: HostNode): string[] {
  return nodes(root).filter((node) => node.props.role === 'treeitem' && node.props['aria-selected'] === true).map((node) => String(node.props['data-path']))
}

/** A drag event carrying either an internal row or operating system files. */
function dragEvent(files: File[] = []) {
  const dataTransfer = { types: files.length ? ['Files'] : [], files, effectAllowed: '', dropEffect: '', setData: vi.fn(), setDragImage: vi.fn() }
  return { dataTransfer, preventDefault: vi.fn() }
}

afterEach(() => vi.unstubAllGlobals())

describe('notebook input provenance', () => {
  it.each([false, true])('binds a staged input to the originating cell and document: changed=%s', async (changed) => {
    const { root, app, generation, activeCellId, noteCellInputs, addSessionInputs } = await render()
    let finish = (_result: unknown) => {}
    addSessionInputs.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    await click(await rowItem(root, 'data', 'Add files from buckets'))
    await click(button(root, 'Pick input into workspace/data/'))
    activeCellId.value = 'second'
    if (changed) generation.value += 1
    finish({ staged: [{ dest_key: 'data/input.txt', version_id: 'source-version', blake3: 'hash' }], failed: [] })
    await flush()
    if (changed) expect(noteCellInputs).not.toHaveBeenCalled()
    else expect(noteCellInputs).toHaveBeenCalledWith('first', [expect.objectContaining({ version_id: 'source-version' })])
    expect(content(root)).not.toContain('are now in')
    app.unmount()
  })
})

describe('kernel file tree', () => {
  it('carries its own header with refresh and hide', async () => {
    const { root, app, onHide } = await render()
    expect(content(root)).toContain('Files')
    const header = element(root, (node) => node.tag === 'header')
    expect(String(header.props.class)).toContain('flex h-12 items-center')
    listScratch.mockClear()
    await click(element(header, (node) => node.props.label === 'Refresh kernel files'))
    expect(listScratch).toHaveBeenCalledWith('job-a', '', { baseUrl: '/api/v1' })
    const hide = element(header, (node) => node.props.label === 'Hide files')
    expect(String(hide.props.class)).toContain('shrink-0')
    await click(hide)
    expect(onHide).toHaveBeenCalledOnce()
    app.unmount()
  })

  it('shows one tree without dot entries and opens folders on demand', async () => {
    const { root, app } = await render()
    expect(listScratch).toHaveBeenCalledWith('job-a', '', { baseUrl: '/api/v1' })
    expect(content(root)).toContain('out.txt')
    expect(content(root)).toContain('12 B')
    expect(content(root)).not.toContain('.aruna')
    expect(content(root)).not.toContain('sub/')
    expect(() => button(root, 'Bucket')).toThrow()
    await expand(root, 'data')
    expect(listScratch).toHaveBeenCalledWith('job-a', 'data', { baseUrl: '/api/v1' })
    expect(content(root)).toContain('sub/')
    expect(content(root)).not.toContain('.cache')
    app.unmount()
  })

  it('shows the row menu on every row and opens it on right click', async () => {
    const { root, app } = await render()
    for (const name of ['data', 'tmp', 'out.txt', 'big.bin']) {
      const dots = menuButton(root, name)
      expect(String(dots.props.class)).not.toContain('opacity-0')
      expect(String(dots.parent?.props.class)).not.toContain('opacity-0')
    }
    expect(() => button(root, 'Download')).toThrow()
    const event = { clientX: 40, clientY: 50, preventDefault: vi.fn() }
    await (row(root, 'out.txt').props.onContextmenu as Handler)(event)
    await flush()
    expect(event.preventDefault).toHaveBeenCalled()
    expect(button(root, 'Download').props.disabled).toBe(false)
    expect(row(root, 'out.txt').props['aria-selected']).toBe(true)
    const anchor = element(root, (node) => node.props['aria-hidden'] === 'true' && String(node.props.class).includes('fixed'))
    expect(anchor.props.style).toEqual({ left: '40px', top: '50px' })
    await (row(root, 'tmp').props.onContextmenu as Handler)(event)
    await flush()
    expect(button(root, 'New folder').props.title).toBe('Only data/ is stored in the bucket')
    expect(() => button(root, 'Download')).toThrow()
    app.unmount()
  })

  it('selects with a click and walks the tree with the keyboard', async () => {
    const { root, app } = await render()
    await click(row(root, 'data'))
    expect(String(row(root, 'data').props.class)).toContain('bg-primary/10')
    expect(row(root, 'data').props.tabindex).toBe(0)
    expect(row(root, 'tmp').props.tabindex).toBe(-1)
    await pressKey(row(root, 'data'), 'ArrowRight')
    expect(row(root, 'data').props['aria-expanded']).toBe(true)
    await pressKey(row(root, 'data'), 'ArrowDown')
    expect(row(root, 'data/other').props['aria-selected']).toBe(true)
    await pressKey(row(root, 'data/other'), 'ArrowLeft')
    expect(row(root, 'data').props['aria-selected']).toBe(true)
    await pressKey(row(root, 'data'), 'ArrowLeft')
    expect(row(root, 'data').props['aria-expanded']).toBe(false)
    await pressKey(row(root, 'data'), 'Enter')
    expect(row(root, 'data').props['aria-expanded']).toBe(true)
    await pressKey(row(root, 'data'), 'ArrowUp')
    expect(row(root, 'data').props['aria-selected']).toBe(true)
    app.unmount()
  })

  it('downloads a small file on double click', async () => {
    const { root, app, readScratch } = await render()
    const link = { href: '', download: '', click: vi.fn() }
    vi.stubGlobal('document', { createElement: () => link })
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:out', revokeObjectURL: vi.fn() })
    readScratch.mockResolvedValue(new Blob(['hello']))
    await (row(root, 'big.bin').props.onDblclick as Handler)({})
    await flush()
    expect(readScratch).not.toHaveBeenCalled()
    await (row(root, 'out.txt').props.onDblclick as Handler)({})
    await flush()
    expect(readScratch).toHaveBeenCalledWith('job-a', 'out.txt', { baseUrl: '/api/v1' })
    expect(link.download).toBe('out.txt')
    expect(link.click).toHaveBeenCalledOnce()
    app.unmount()
  })

  it('creates a folder under data/ with the marker key and not elsewhere', async () => {
    const { root, app, s3 } = await render()
    const outside = await rowItem(root, 'tmp', 'New folder')
    expect(outside.props.disabled).toBe(true)
    expect(outside.props.title).toBe('Only data/ is stored in the bucket')
    await click(await rowItem(root, 'data', 'New folder'))
    const field = element(root, (node) => node.props['aria-label'] === 'New folder name')
    await typeValue(field, 'fresh')
    listScratch.mockClear()
    await pressEnter(field)
    expect(s3.createFolder).toHaveBeenCalledWith('workspace', 'data/', 'fresh')
    expect(listScratch.mock.calls.map((call) => call[1])).toContain('data')
    app.unmount()
  })

  it('stages into the folder of the row menu and reports failures only', async () => {
    const { root, app, addSessionInputs } = await render()
    await expand(root, 'data')
    await expand(root, 'sub')
    await click(await rowItem(root, 'sub', 'Add files from buckets'))
    expect(content(root)).toContain('Pick input into workspace/data/sub/')
    addSessionInputs.mockResolvedValue({
      staged: [{ dest_key: 'data/sub/input.txt', bytes: 1, blake3: 'hash' }],
      pending: [],
      failed: [{ dest_key: 'data/sub/other.txt', error: 'source gone' }],
    })
    listScratch.mockClear()
    await click(button(root, 'Pick input into workspace/data/sub/'))
    expect(addSessionInputs).toHaveBeenCalledWith('job-a', [expect.objectContaining({ dest_key: 'data/sub/input.txt' })], { baseUrl: '/api/v1' })
    expect(content(root)).toContain('1 of 1 files failed: source gone')
    expect(content(root)).not.toContain('are now in')
    expect(listScratch.mock.calls.map((call) => call[1])).toEqual(expect.arrayContaining(['', 'data', 'data/sub']))
    expect((await rowItem(root, 'tmp', 'Add files from buckets')).props.title).toBe('Only data/ is stored in the bucket')
    await click(await rowItem(root, 'sub', 'Import from connector'))
    expect(content(root)).toContain('Import into data/sub/')
    app.unmount()
  })

  it('copies a data/ file with a server-side copy', async () => {
    const { root, app, s3 } = await render()
    await expand(root, 'data')
    await expand(root, 'sub')
    await click(await rowItem(root, 'a.csv', 'Copy to bucket'))
    await click(button(root, 'Copy 1 of a.csv to dest'))
    expect(s3.copyObject).toHaveBeenCalledWith({ bucket: 'workspace', key: 'data/sub/a.csv' }, 'dest', 'out/a.csv')
    expect(content(root)).toContain('Copied a.csv to dest/out/.')
    app.unmount()
  })

  it('uploads a small scratch file and refuses a large one', async () => {
    const { root, app, s3, readScratch } = await render()
    readScratch.mockResolvedValue(new Blob(['hello'], { type: 'text/plain' }))
    const large = await rowItem(root, 'big.bin', 'Copy to bucket')
    expect(large.props.disabled).toBe(true)
    expect(large.props.title).toContain(`Larger than ${LIMIT} B`)
    expect((await rowItem(root, 'big.bin', 'Download')).props.disabled).toBe(true)
    await click(await rowItem(root, 'out.txt', 'Copy to bucket'))
    await click(button(root, 'Copy 1 of out.txt to dest'))
    expect(readScratch).toHaveBeenCalledWith('job-a', 'out.txt', { baseUrl: '/api/v1' })
    expect(s3.uploadObject).toHaveBeenCalledWith('dest', 'out/out.txt', expect.objectContaining({ name: 'out.txt' }))
    expect(s3.copyObject).not.toHaveBeenCalled()
    app.unmount()
  })

  it('copies every object below a data/ folder and none from scratch', async () => {
    const { root, app, s3 } = await render()
    await expand(root, 'data')
    const scratch = await rowItem(root, 'tmp', 'Copy to bucket')
    expect(scratch.props.disabled).toBe(true)
    s3.listObjectsRecursive.mockResolvedValue({ objects: [{ key: 'data/sub/a.csv' }, { key: 'data/sub/deep/b.csv' }], truncated: false })
    await click(await rowItem(root, 'sub', 'Copy to bucket'))
    expect(s3.listObjectsRecursive).toHaveBeenCalledWith('workspace', 'data/sub/', 500)
    await click(button(root, 'Copy 2 of sub to dest'))
    expect(s3.copyObject.mock.calls.map((call) => call[2])).toEqual(['out/sub/a.csv', 'out/sub/deep/b.csv'])
    expect(content(root)).toContain('Copied 2 files from sub/ to dest/out/sub/.')
    s3.listObjectsRecursive.mockResolvedValue({ objects: [], truncated: true })
    await click(await rowItem(root, 'sub', 'Copy to bucket'))
    expect(content(root)).toContain('sub/ holds more than 500 files.')
    app.unmount()
  })

  it('moves a dropped data/ file by copying and then deleting it', async () => {
    const { root, app, s3 } = await render()
    await expand(root, 'data')
    await expand(root, 'sub')
    const event = dragEvent()
    await (row(root, 'data/sub/a.csv').props.onDragstart as Handler)(event)
    expect(row(root, 'data/sub/a.csv').props.draggable).toBe(true)
    expect(event.dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'data/sub/a.csv')
    await (row(root, 'data/sub').props.onDragover as Handler)(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
    await (row(root, 'data/other').props.onDragover as Handler)(event)
    await flush()
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.dataTransfer.dropEffect).toBe('move')
    expect(String(row(root, 'data/other').props.class)).toContain('ring-primary')
    listScratch.mockClear()
    await (row(root, 'data/other').props.onDrop as Handler)(event)
    await flush()
    expect(s3.copyObject).toHaveBeenCalledWith({ bucket: 'workspace', key: 'data/sub/a.csv' }, 'workspace', 'data/other/a.csv')
    expect(s3.deleteObject).toHaveBeenCalledWith('workspace', 'data/sub/a.csv')
    expect(s3.copyObject.mock.invocationCallOrder[0]).toBeLessThan(s3.deleteObject.mock.invocationCallOrder[0])
    expect(content(root)).toContain('Moved a.csv to data/other/.')
    expect(String(row(root, 'data/other').props.class)).not.toContain('ring-primary')
    expect(listScratch.mock.calls.map((call) => call[1])).toContain('data')
    app.unmount()
  })

  it('moves a data/ folder object by object within the bound', async () => {
    const { root, app, s3 } = await render()
    await expand(root, 'data')
    s3.listObjectsRecursive.mockResolvedValue({ objects: [{ key: 'data/sub/' }, { key: 'data/sub/a.csv' }], truncated: false })
    const event = dragEvent()
    await (row(root, 'data/sub').props.onDragstart as Handler)(event)
    await (row(root, 'data/sub').props.onDragover as Handler)(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
    await (row(root, 'data/other').props.onDrop as Handler)(event)
    await flush()
    expect(s3.copyObject.mock.calls.map((call) => call[2])).toEqual(['data/other/sub/', 'data/other/sub/a.csv'])
    expect(s3.deleteObject.mock.calls.map((call) => call[1])).toEqual(['data/sub/', 'data/sub/a.csv'])
    s3.listObjectsRecursive.mockResolvedValue({ objects: [], truncated: true })
    await (row(root, 'data/sub').props.onDragstart as Handler)(event)
    await (row(root, 'data/other').props.onDrop as Handler)(event)
    await flush()
    expect(content(root)).toContain('sub/ holds more than 500 files. Move a smaller folder.')
    app.unmount()
  })

  it('uploads dropped operating system files into the data/ folder', async () => {
    const { root, app, s3 } = await render()
    await expand(root, 'data')
    const event = dragEvent([new File(['a'], 'x.txt'), new File(['b'], 'y.txt')])
    await (row(root, 'data/sub').props.onDragover as Handler)(event)
    expect(event.dataTransfer.dropEffect).toBe('copy')
    await (row(root, 'data/sub').props.onDrop as Handler)(event)
    await flush()
    expect(s3.uploadObject.mock.calls.map((call) => [call[0], call[1]])).toEqual([['workspace', 'data/sub/x.txt'], ['workspace', 'data/sub/y.txt']])
    expect(content(root)).toContain('Uploaded 2 files to data/sub/.')
    s3.uploadObject.mockReturnValueOnce({ promise: Promise.reject(new Error('quota')), abort: vi.fn() })
    await (row(root, 'data/sub').props.onDrop as Handler)(event)
    await flush()
    expect(content(root)).toContain('quota')
    app.unmount()
  })

  it('refuses drops on scratch rows and does not drag them', async () => {
    const { root, app, s3 } = await render()
    expect(row(root, 'tmp').props.draggable).toBe(false)
    const event = dragEvent([new File(['a'], 'x.txt')])
    await (row(root, 'tmp').props.onDragover as Handler)(event)
    await flush()
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(event.dataTransfer.dropEffect).toBe('none')
    expect(String(row(root, 'tmp').props.class)).not.toContain('ring-primary')
    await (row(root, 'tmp').props.onDrop as Handler)(event)
    await flush()
    expect(s3.uploadObject).not.toHaveBeenCalled()
    const internal = dragEvent()
    await (row(root, 'out.txt').props.onDragstart as Handler)(internal)
    await (row(root, 'data').props.onDragover as Handler)(internal)
    expect(internal.preventDefault).not.toHaveBeenCalled()
    app.unmount()
  })

  it('renames a data/ file inline and keeps scratch read only', async () => {
    const { root, app, s3 } = await render()
    const scratch = await rowItem(root, 'out.txt', 'Rename')
    expect(scratch.props.disabled).toBe(true)
    expect(scratch.props.title).toBe('Only data/ is stored in the bucket')
    expect((await rowItem(root, 'out.txt', 'Delete')).props.disabled).toBe(true)
    await expand(root, 'data')
    await expand(root, 'sub')
    await click(await rowItem(root, 'a.csv', 'Rename'))
    const field = element(root, (node) => node.props['aria-label'] === 'New name')
    expect(field.props.value).toBe('a.csv')
    await typeValue(field, 'b.csv')
    await pressEnter(field)
    expect(s3.copyObject).toHaveBeenCalledWith({ bucket: 'workspace', key: 'data/sub/a.csv' }, 'workspace', 'data/sub/b.csv')
    expect(s3.deleteObject).toHaveBeenCalledWith('workspace', 'data/sub/a.csv')
    expect(content(root)).toContain('Renamed a.csv to b.csv.')
    app.unmount()
  })

  it('deletes a data/ entry after the inline confirm', async () => {
    const { root, app, s3 } = await render()
    await expand(root, 'data')
    await expand(root, 'sub')
    await click(await rowItem(root, 'a.csv', 'Delete'))
    expect(content(root)).toContain('Delete a.csv?')
    await click(button(root, 'Cancel'))
    expect(s3.deleteObject).not.toHaveBeenCalled()
    await click(await rowItem(root, 'a.csv', 'Delete'))
    await click(element(root, (node) => node.tag === 'button' && node.props.variant === 'destructive'))
    expect(s3.deleteObject).toHaveBeenCalledWith('workspace', 'data/sub/a.csv')
    s3.listObjectsRecursive.mockResolvedValue({ objects: [{ key: 'data/sub/a.csv' }], truncated: false })
    await click(await rowItem(root, 'sub', 'Delete'))
    expect(content(root)).toContain('Delete sub/?')
    await click(element(root, (node) => node.tag === 'button' && node.props.variant === 'destructive'))
    expect(s3.listObjectsRecursive).toHaveBeenCalledWith('workspace', 'data/sub/', 500)
    expect(s3.deletePrefix).toHaveBeenCalledWith('workspace', 'data/sub/')
    app.unmount()
  })

  it('tells a starting kernel apart from no session', async () => {
    const starting = await render({ live: false, starting: true })
    expect(content(starting.root)).toContain('The kernel is starting.')
    starting.app.unmount()
    const idle = await render({ live: false, running: false })
    expect(content(idle.root)).toContain('Not running.')
    expect(listScratch).not.toHaveBeenCalled()
    await click(element(idle.root, (node) => node.tag === 'button' && content(node).includes('Start kernel')))
    expect(idle.onStart).toHaveBeenCalledOnce()
    idle.app.unmount()
  })
})

describe('kernel file selection', () => {
  const destructive = (root: HostNode) => element(root, (node) => node.tag === 'button' && node.props.variant === 'destructive')

  it('selects a range with shift click and shift arrows', async () => {
    const { root, app } = await render()
    expect(element(root, (node) => node.props.role === 'tree').props['aria-multiselectable']).toBe('true')
    await expand(root, 'data')
    await click(row(root, 'data'))
    await clickWith(row(root, 'data/sub'), { shiftKey: true })
    expect(selectedPaths(root)).toEqual(['data', 'data/other', 'data/sub'])
    await pressKey(row(root, 'data/sub'), 'ArrowDown', { shiftKey: true })
    expect(selectedPaths(root)).toEqual(['data', 'data/other', 'data/sub', 'tmp'])
    expect(row(root, 'tmp').props.tabindex).toBe(0)
    await pressKey(row(root, 'tmp'), 'ArrowUp', { shiftKey: true })
    expect(selectedPaths(root)).toEqual(['data', 'data/other', 'data/sub'])
    await clickWith(row(root, 'big.bin'), { shiftKey: true })
    expect(selectedPaths(root)).toEqual(['data', 'data/other', 'data/sub', 'tmp', 'big.bin'])
    await pressKey(row(root, 'big.bin'), 'Escape')
    expect(selectedPaths(root)).toEqual(['big.bin'])
    app.unmount()
  })

  it('toggles with ctrl click and keeps or replaces the selection on right click', async () => {
    const { root, app } = await render()
    await click(row(root, 'data'))
    await clickWith(row(root, 'tmp'), { ctrlKey: true })
    expect(selectedPaths(root)).toEqual(['data', 'tmp'])
    await clickWith(row(root, 'data'), { metaKey: true })
    expect(selectedPaths(root)).toEqual(['tmp'])
    await clickWith(row(root, 'data'), { ctrlKey: true })
    await rightClick(row(root, 'tmp'))
    expect(selectedPaths(root)).toEqual(['data', 'tmp'])
    await rightClick(row(root, 'big.bin'))
    expect(selectedPaths(root)).toEqual(['big.bin'])
    app.unmount()
  })

  it('deletes every selected data/ entry after one confirm and blocks rename', async () => {
    const { root, app, s3 } = await render()
    await expand(root, 'data')
    await expand(root, 'sub')
    await click(row(root, 'data/other'))
    await clickWith(row(root, 'data/sub/a.csv'), { ctrlKey: true })
    s3.listObjectsRecursive.mockResolvedValue({ objects: [{ key: 'data/other/' }], truncated: false })
    const rename = await rowItem(root, 'a.csv', 'Rename')
    expect(rename.props.disabled).toBe(true)
    expect(rename.props.title).toBe('Select one item to rename')
    await click(await rowItem(root, 'a.csv', 'Delete 2 items'))
    expect(content(root)).toContain('Delete 2 items?')
    expect(content(root)).toContain('data/other, data/sub/a.csv')
    await click(destructive(root))
    expect(s3.deletePrefix).toHaveBeenCalledWith('workspace', 'data/other/')
    expect(s3.deleteObject).toHaveBeenCalledWith('workspace', 'data/sub/a.csv')
    expect(selectedPaths(root)).toEqual([])
    app.unmount()
  })

  it('refuses to delete a mixed selection but still copies it', async () => {
    const { root, app, s3, readScratch } = await render()
    readScratch.mockResolvedValue(new Blob(['hello'], { type: 'text/plain' }))
    await expand(root, 'data')
    await expand(root, 'sub')
    await click(row(root, 'data/sub/a.csv'))
    await clickWith(row(root, 'out.txt'), { ctrlKey: true })
    const remove = await rowItem(root, 'a.csv', 'Delete 2 items')
    expect(remove.props.disabled).toBe(true)
    expect(remove.props.title).toBe('Only data/ is stored in the bucket')
    await pressKey(row(root, 'data/sub/a.csv'), 'Delete')
    expect(content(root)).not.toContain('Delete 2 items?')
    await click(await rowItem(root, 'a.csv', 'Copy 2 items to bucket'))
    await click(button(root, 'Copy 2 of 2 items to dest'))
    expect(s3.copyObject).toHaveBeenCalledWith({ bucket: 'workspace', key: 'data/sub/a.csv' }, 'dest', 'out/a.csv')
    expect(s3.uploadObject).toHaveBeenCalledWith('dest', 'out/out.txt', expect.objectContaining({ name: 'out.txt' }))
    expect(content(root)).toContain('Copied 2 items to dest/out/.')
    app.unmount()
  })

  it('opens the inline confirm with the Delete key', async () => {
    const { root, app, s3 } = await render()
    await expand(root, 'data')
    await expand(root, 'sub')
    await click(row(root, 'data/sub/a.csv'))
    await pressKey(row(root, 'data/sub/a.csv'), 'Delete')
    expect(content(root)).toContain('Delete a.csv?')
    await click(destructive(root))
    expect(s3.deleteObject).toHaveBeenCalledWith('workspace', 'data/sub/a.csv')
    await click(row(root, 'out.txt'))
    await pressKey(row(root, 'out.txt'), 'Delete')
    expect(content(root)).not.toContain('Delete out.txt?')
    app.unmount()
  })

  it('moves every selected data/ row by drag and counts them on the chip', async () => {
    const { root, app, s3 } = await render()
    const chip = { textContent: '', className: '', style: {}, remove: vi.fn() }
    vi.stubGlobal('document', { body: { appendChild: vi.fn() }, createElement: () => chip })
    await expand(root, 'data')
    await expand(root, 'sub')
    await expand(root, 'deep')
    await click(row(root, 'data/sub/a.csv'))
    await clickWith(row(root, 'data/sub/deep/z.csv'), { ctrlKey: true })
    const event = dragEvent()
    await (row(root, 'data/sub/a.csv').props.onDragstart as Handler)(event)
    expect(chip.textContent).toBe('2 items')
    expect(event.dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'data/sub/deep/z.csv\ndata/sub/a.csv')
    await (row(root, 'data/sub').props.onDragover as Handler)(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
    await (row(root, 'data/other').props.onDrop as Handler)(event)
    await flush()
    expect(s3.copyObject.mock.calls.map((call) => [call[0].key, call[2]])).toEqual([
      ['data/sub/deep/z.csv', 'data/other/z.csv'],
      ['data/sub/a.csv', 'data/other/a.csv'],
    ])
    expect(s3.deleteObject.mock.calls.map((call) => call[1])).toEqual(['data/sub/deep/z.csv', 'data/sub/a.csv'])
    expect(content(root)).toContain('Moved 2 items to data/other/.')
    app.unmount()
  })
})

describe('kernel folder breadcrumb', () => {
  const crumbs = (root: HostNode) =>
    nodes(root).filter((node) => node.tag === 'button' && node.parent?.props['aria-label'] === 'Current folder').map((node) => content(node).trim())
  const crumb = (root: HostNode, name: string) =>
    element(root, (node) => node.tag === 'button' && node.parent?.props['aria-label'] === 'Current folder' && content(node).trim() === name)

  it('shows the root, the folder of the focused file and an ellipsis for a long path', async () => {
    const { root, app } = await render()
    expect(crumbs(root)).toEqual(['work'])
    await expand(root, 'data')
    await expand(root, 'sub')
    await click(row(root, 'data/sub/a.csv'))
    expect(crumbs(root)).toEqual(['work', 'data', 'sub'])
    expect(crumb(root, 'sub').props['aria-current']).toBe('location')
    expect(crumb(root, 'data').props['aria-current']).toBeUndefined()
    await expand(root, 'deep')
    await click(row(root, 'data/sub/deep/z.csv'))
    expect(crumbs(root)).toEqual(['work', 'deep'])
    expect(element(root, (node) => node.tag === 'span' && content(node) === '…').props.title).toBe('data/sub')
    app.unmount()
  })

  it('selects, opens and scrolls to the folder of a clicked segment', async () => {
    const { root, app } = await render()
    await expand(root, 'data')
    await click(row(root, 'data/sub'))
    expect(crumbs(root)).toEqual(['work', 'data', 'sub'])
    expect(row(root, 'data/sub').props['aria-expanded']).toBe(false)
    const scrollIntoView = vi.fn()
    Object.assign(row(root, 'data/sub'), { scrollIntoView })
    await click(crumb(root, 'sub'))
    expect(row(root, 'data/sub').props['aria-expanded']).toBe(true)
    expect(selectedPaths(root)).toEqual(['data/sub'])
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
    await click(crumb(root, 'data'))
    expect(selectedPaths(root)).toEqual(['data'])
    expect(crumbs(root)).toEqual(['work', 'data'])
    await click(crumb(root, 'work'))
    expect(selectedPaths(root)).toEqual([])
    expect(crumbs(root)).toEqual(['work'])
    app.unmount()
  })
})
