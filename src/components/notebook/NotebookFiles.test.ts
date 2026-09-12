import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { button, click, compileClientComponent, content, element, flush, moduleDefault, mountApp, typeValue, type HostNode } from '@/test/clientRender'

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
  data: [{ name: 'sub', kind: 'dir', bytes: 0, modified_ms: 0 }, { name: '.cache', kind: 'file', bytes: 1, modified_ms: 0 }],
  'data/sub': [{ name: 'a.csv', kind: 'file', bytes: 5, modified_ms: 0 }],
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
  const collapsed = ref(false)
  const activeCellId = ref('first')
  const noteCellInputs = vi.fn()
  const addSessionInputs = vi.fn()
  const readScratch = vi.fn()
  const s3 = {
    listObjects: vi.fn().mockResolvedValue({ objects: [] }),
    listObjectsRecursive: vi.fn(),
    createFolder: vi.fn().mockResolvedValue(undefined),
    copyObject: vi.fn().mockResolvedValue(undefined),
    uploadObject: vi.fn(() => ({ promise: Promise.resolve(), abort: vi.fn() })),
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
    '@/components/ui/IconButton.vue': moduleDefault(ButtonStub),
    '@/components/ui/Button.vue': moduleDefault(ButtonStub),
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
  const { root, app } = await mountApp(defineComponent({ setup: () => () => h(component, { collapsed: collapsed.value, onToggle: () => { collapsed.value = !collapsed.value }, onStart }) }))
  await flush()
  return { root, app, generation, activeCellId, noteCellInputs, addSessionInputs, readScratch, s3, session, onStart }
}

/** The menu item `label` on the row named `name`. */
function rowItem(root: HostNode, name: string, label: string): HostNode {
  const title = element(root, (node) => node.tag === 'span' && node.props.title === name)
  return element(title.parent!, (node) => node.tag === 'button' && content(node).trim() === label)
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

describe('notebook input provenance', () => {
  it('collapses and expands from the file pane header', async () => {
    const { root, app } = await render()
    await click(element(root, (node) => node.props.label === 'Collapse files'))
    expect(() => element(root, (node) => node.props.label === 'Refresh kernel files')).toThrow()
    await click(element(root, (node) => node.props.label === 'Expand files'))
    expect(element(root, (node) => node.props.label === 'Refresh kernel files')).toBeTruthy()
    app.unmount()
  })

  it.each([false, true])('binds a staged input to the originating cell and document: changed=%s', async (changed) => {
    const { root, app, generation, activeCellId, noteCellInputs, addSessionInputs } = await render()
    let finish = (_result: unknown) => {}
    addSessionInputs.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    await click(rowItem(root, 'data', 'Add files from buckets'))
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

  it('creates a folder under data/ with the marker key and not elsewhere', async () => {
    const { root, app, s3 } = await render()
    const outside = rowItem(root, 'tmp', 'New folder')
    expect(outside.props.disabled).toBe(true)
    expect(outside.props.title).toBe('Only data/ is stored in the bucket')
    await click(rowItem(root, 'data', 'New folder'))
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
    await click(rowItem(root, 'sub', 'Add files from buckets'))
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
    expect(rowItem(root, 'tmp', 'Add files from buckets').props.title).toBe('Only data/ is stored in the bucket')
    await click(rowItem(root, 'sub', 'Import from connector'))
    expect(content(root)).toContain('Import into data/sub/')
    app.unmount()
  })

  it('copies a data/ file with a server-side copy', async () => {
    const { root, app, s3 } = await render()
    await expand(root, 'data')
    await expand(root, 'sub')
    await click(rowItem(root, 'a.csv', 'Copy to bucket'))
    await click(button(root, 'Copy 1 of a.csv to dest'))
    expect(s3.copyObject).toHaveBeenCalledWith({ bucket: 'workspace', key: 'data/sub/a.csv' }, 'dest', 'out/a.csv')
    expect(content(root)).toContain('Copied a.csv to dest/out/.')
    app.unmount()
  })

  it('uploads a small scratch file and refuses a large one', async () => {
    const { root, app, s3, readScratch } = await render()
    readScratch.mockResolvedValue(new Blob(['hello'], { type: 'text/plain' }))
    const large = rowItem(root, 'big.bin', 'Copy to bucket')
    expect(large.props.disabled).toBe(true)
    expect(large.props.title).toContain(`Larger than ${LIMIT} B`)
    expect(rowItem(root, 'big.bin', 'Download').props.disabled).toBe(true)
    await click(rowItem(root, 'out.txt', 'Copy to bucket'))
    await click(button(root, 'Copy 1 of out.txt to dest'))
    expect(readScratch).toHaveBeenCalledWith('job-a', 'out.txt', { baseUrl: '/api/v1' })
    expect(s3.uploadObject).toHaveBeenCalledWith('dest', 'out/out.txt', expect.objectContaining({ name: 'out.txt' }))
    expect(s3.copyObject).not.toHaveBeenCalled()
    app.unmount()
  })

  it('copies every object below a data/ folder and none from scratch', async () => {
    const { root, app, s3 } = await render()
    await expand(root, 'data')
    const scratch = rowItem(root, 'tmp', 'Copy to bucket')
    expect(scratch.props.disabled).toBe(true)
    s3.listObjectsRecursive.mockResolvedValue({ objects: [{ key: 'data/sub/a.csv' }, { key: 'data/sub/deep/b.csv' }], truncated: false })
    await click(rowItem(root, 'sub', 'Copy to bucket'))
    expect(s3.listObjectsRecursive).toHaveBeenCalledWith('workspace', 'data/sub/', 500)
    await click(button(root, 'Copy 2 of sub to dest'))
    expect(s3.copyObject.mock.calls.map((call) => call[2])).toEqual(['out/sub/a.csv', 'out/sub/deep/b.csv'])
    expect(content(root)).toContain('Copied 2 files from sub/ to dest/out/sub/.')
    s3.listObjectsRecursive.mockResolvedValue({ objects: [], truncated: true })
    await click(rowItem(root, 'sub', 'Copy to bucket'))
    expect(content(root)).toContain('sub/ holds more than 500 files.')
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
