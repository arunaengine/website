import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { button, click, compileClientComponent, content, element, flush, moduleDefault, mountApp } from '@/test/clientRender'

const listScratch = vi.hoisted(() => vi.fn())
vi.mock('@/lib/notebook/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/notebook/session')>()),
  listScratch,
}))

import * as sessionFiles from '@/composables/useSessionFiles'

type Entry = { name: string; kind: 'file' | 'dir'; bytes: number; modified_ms: number }
const TREE: Record<string, Entry[]> = {
  '': [
    { name: 'out.txt', kind: 'file', bytes: 12, modified_ms: 0 },
    { name: 'data', kind: 'dir', bytes: 0, modified_ms: 0 },
    { name: 'tmp', kind: 'dir', bytes: 0, modified_ms: 0 },
  ],
  data: [{ name: 'sub', kind: 'dir', bytes: 0, modified_ms: 0 }],
  'data/sub': [],
  tmp: [],
}

async function render(options: { live?: boolean; running?: boolean; starting?: boolean } = {}) {
  const generation = ref(1)
  const collapsed = ref(false)
  const activeCellId = ref('first')
  const noteCellInputs = vi.fn()
  const addSessionInputs = vi.fn()
  listScratch.mockReset()
  listScratch.mockImplementation(async (_job: string, path: string) => {
    if (options.starting) throw new ApiError(409, 'starting', 'session_starting')
    return { path, entries: TREE[path] ?? [] }
  })
  const stub = defineComponent({ setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()) })
  const textStub = defineComponent({ props: ['title', 'description'], setup: (props) => () => h('p', `${props.title} ${props.description ?? ''}`) })
  const toggle = defineComponent({ props: ['modelValue', 'options'], emits: ['update:modelValue'], setup: (props, { emit }) => () =>
    props.options.map((option: { value: string; label: string }) => h('button', { onClick: () => emit('update:modelValue', option.value) }, option.label)) })
  const picker = defineComponent({ props: ['destination'], setup: (props, { emit }) => () => h('button', {
    onClick: () => emit('add', { kind: 'file', url: 's3://source/input.txt', name: 'input.txt' }),
  }, `Pick input into ${props.destination}`) })
  // The store derives running from the job id, so a stopped fake has none.
  const session = {
    jobId: ref(options.running === false ? '' : 'job-a'), live: ref(options.live ?? true), running: ref(options.running ?? true), ended: ref(false),
    cellStates: ref({}), client: ref({ baseUrl: '/api/v1' }),
  }
  const modules: Record<string, unknown> = {
    vue: VueRuntime,
    '@lucide/vue': new Proxy({}, { get: () => stub }),
    '@/composables/notebookContext': { injectNotebook: () => ({
      notebook: { generation, activeCellId, noteCellInputs, meta: ref({ workspace_bucket: 'workspace' }) },
      session,
    }) },
    '@/composables/useS3': { useS3: () => ({ listObjects: vi.fn() }) },
    '@/composables/useSessionFiles': sessionFiles,
    '@/lib/notebook/session': { addSessionInputs, readScratch: vi.fn(), SCRATCH_READ_LIMIT_BYTES: 8 * 1024 * 1024 },
    '@/lib/notebook/document': { NOTEBOOK_DATA_PREFIX: 'data/' },
    '@/lib/tes': { parseS3Url: () => ({ bucket: 'source', key: 'input.txt' }) },
    '@/lib/utils': { errorMessage: (cause: Error) => cause.message, formatBytes: (bytes: number) => `${bytes} B` },
  }
  for (const path of ['ui/IconButton', 'ui/Button', 'ui/Notice', 'ui/Spinner', 'data/ObjectBrowserPanel', 'data/AddDataDialog']) {
    modules[`@/components/${path}.vue`] = moduleDefault(stub)
  }
  modules['@/components/ui/EmptyState.vue'] = moduleDefault(textStub)
  modules['@/components/ui/OptionToggle.vue'] = moduleDefault(toggle)
  modules['@/components/compute/TesDataRefDialog.vue'] = moduleDefault(picker)
  const component = compileClientComponent(new URL('./NotebookFiles.vue', import.meta.url), modules)
  const { root, app } = await mountApp(defineComponent({ setup: () => () => h(component, { collapsed: collapsed.value, onToggle: () => { collapsed.value = !collapsed.value } }) }))
  await flush()
  return { root, app, generation, activeCellId, noteCellInputs, addSessionInputs, session }
}

describe('notebook input provenance', () => {
  it('collapses and expands from the file pane header', async () => {
    const { root, app } = await render()
    await click(element(root, (node) => node.props.label === 'Collapse files'))
    expect(() => element(root, (node) => node.props.label === 'Add files')).toThrow()
    await click(element(root, (node) => node.props.label === 'Expand files'))
    expect(element(root, (node) => node.props.label === 'Add files')).toBeTruthy()
    app.unmount()
  })

  it.each([false, true])('binds a staged input to the originating cell and document: changed=%s', async (changed) => {
    const { root, app, generation, activeCellId, noteCellInputs, addSessionInputs } = await render()
    let finish = (_result: unknown) => {}
    addSessionInputs.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    expect(content(root)).toContain('Pick input into workspace/data/')
    await click(button(root, 'Pick input into workspace/data/'))
    activeCellId.value = 'second'
    if (changed) generation.value += 1
    finish({ staged: [{ dest_key: 'data/input.txt', version_id: 'source-version', blake3: 'hash' }] })
    await flush()
    if (changed) {
      expect(noteCellInputs).not.toHaveBeenCalled()
      expect(content(root)).not.toContain('files are now')
    } else {
      expect(noteCellInputs).toHaveBeenCalledWith('first', [expect.objectContaining({ version_id: 'source-version' })])
    }
    app.unmount()
  })
})

describe('kernel file tree', () => {
  it('shows the kernel folder first and opens folders on demand', async () => {
    const { root, app } = await render()
    expect(listScratch).toHaveBeenCalledWith('job-a', '', { baseUrl: '/api/v1' })
    expect(content(root)).toContain('out.txt')
    expect(content(root)).toContain('12 B')
    expect(content(root)).not.toContain('sub/')
    await click(button(root, 'data/'))
    expect(listScratch).toHaveBeenCalledWith('job-a', 'data', { baseUrl: '/api/v1' })
    expect(content(root)).toContain('sub/')
    await click(button(root, 'Bucket'))
    expect(content(root)).not.toContain('out.txt')
    app.unmount()
  })

  it('stages into the picked folder under data/ and counts failures', async () => {
    const { root, app, addSessionInputs } = await render()
    await click(button(root, 'data/'))
    await click(button(root, 'sub/'))
    expect(content(root)).toContain('Pick input into workspace/data/sub/')
    addSessionInputs.mockResolvedValue({
      staged: [{ dest_key: 'data/sub/input.txt', bytes: 1, blake3: 'hash' }],
      pending: [],
      failed: [{ dest_key: 'data/sub/other.txt', error: 'source gone' }],
    })
    listScratch.mockClear()
    await click(button(root, 'Pick input into workspace/data/sub/'))
    expect(addSessionInputs).toHaveBeenCalledWith('job-a', [expect.objectContaining({ dest_key: 'data/sub/input.txt' })], { baseUrl: '/api/v1' })
    expect(content(root)).toContain('1 of 1 files are now in data/sub/. 1 failed: source gone')
    expect(listScratch.mock.calls.map((call) => call[1])).toEqual(expect.arrayContaining(['', 'data', 'data/sub']))
    app.unmount()
  })

  it('keeps data/ as the target when a scratch folder is picked', async () => {
    const { root, app } = await render()
    await click(button(root, 'tmp/'))
    expect(content(root)).toContain('Only data/ receives staged files.')
    expect(content(root)).toContain('Pick input into workspace/data/')
    app.unmount()
  })

  it('tells a starting kernel apart from no session', async () => {
    const starting = await render({ live: false, starting: true })
    expect(content(starting.root)).toContain('The kernel is starting.')
    starting.app.unmount()
    const idle = await render({ live: false, running: false })
    expect(content(idle.root)).toContain('Not running.')
    expect(listScratch).not.toHaveBeenCalled()
    idle.app.unmount()
  })
})
