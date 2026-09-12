import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Runtimes from '@/lib/notebook/runtimes'
import { newCell, type CellKind } from '@/lib/notebook/nbformat'
import { button, click, compileClientComponent, content, element, flush, moduleDefault, mountApp } from '@/test/clientRender'

async function render() {
  const cells = ref(['a', 'b', 'c'].map((id) => ({ ...newCell('code', id), id })))
  const activeCellId = ref('a')
  const ended = ref(false)
  const moveCell = vi.fn()
  const addCell = vi.fn((kind: CellKind = 'code', index?: number) => { const cell = { ...newCell(kind), id: 'new-cell' }; cells.value.splice(index ?? cells.value.length, 0, cell); return cell })
  const addAttachment = vi.fn()
  const notebook = {
    cells, activeCellId, moveCell, addCell, addAttachment,
    selectCell: (id: string) => { activeCellId.value = id },
    name: ref('analysis'), meta: ref({ runtime: 'python-notebook', group_id: 'group', workspace_bucket: 'lab' }),
    scope: ref('account'), generation: ref(1),
    saving: ref(false), loading: ref(false), dirty: ref(false),
    loadError: ref(null), saveError: ref<string | null>(null), loadDenied: ref(false), lastSavedMs: ref(0),
    load: vi.fn(async () => {}), autosave: vi.fn(), save: vi.fn(), flushSave: vi.fn(async () => true), flushCopy: vi.fn(),
  }
  const Slotted = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
  const Button = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
  const Select = defineComponent({
    props: ['modelValue', 'options'], emits: ['update:modelValue'],
    setup: (props, { attrs, emit }) => () => h('select', {
      ...attrs, value: props.modelValue, options: props.options,
      onChange: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    }),
  })
  const Cell = defineComponent({
    props: ['cell', 'markdownLocked'], emits: ['drag-cell', 'add-below'],
    setup: (props, { emit }) => () => h('div', { locked: props.markdownLocked }, [h('button', { onDragstart: (event: DragEvent) => emit('drag-cell', event) }, `Drag ${props.cell.id}`), h('button', { onClick: () => emit('add-below') }, `Add below ${props.cell.id}`)]),
  })
  const modules: Record<string, unknown> = {
    vue: VueRuntime,
    'vue-router': { useRoute: () => ({ params: { bucketId: 'lab', key: 'analysis.ipynb' }, query: { group: 'group' } }), useRouter: () => ({ push: vi.fn() }) },
    '@lucide/vue': new Proxy({}, { get: () => Slotted }),
    '@/components/ui/Button.vue': moduleDefault(Button),
    '@/components/ui/IconButton.vue': moduleDefault(Button),
    '@/components/ui/Select.vue': moduleDefault(Select),
    '@/components/notebook/NotebookCell.vue': moduleDefault(Cell),
    '@/composables/notebookContext': { provideNotebook: vi.fn() },
    '@/composables/useNotebook': { createNotebook: () => notebook },
    '@/composables/useNotebookSession': { createNotebookSession: () => ({
      detach: vi.fn(), attachSaved: vi.fn(), live: ref(true), ended, jobId: ref('job'), running: ref(true), runCells: vi.fn(),
    }) },
    '@/composables/useAssistantNotebook': { provideNotebookBridge: vi.fn() },
    '@/lib/notebook/bridge': { createNotebookBridge: vi.fn() },
    '@/composables/useAruna': { useAruna: () => ({ myGroups: ref([{ id: 'group' }]) }) },
    '@/composables/useGroupSelection': { activeGroupId: ref('group') },
    '@/composables/useNotebookLocation': { useNotebookLocation: () => ({ scope: ref('scope'), remember: vi.fn() }) },
    '@/composables/useTes': { useTes: () => ({ tesEnabled: ref(true) }) },
    '@/lib/notebook/runtimes': Runtimes,
    '@/lib/utils': { relativeTime: () => 'now' },
  }
  for (const path of ['ui/DialogContent', 'ui/DialogHeader', 'ui/DialogTitle', 'ui/DialogDescription', 'dashboard/PageHeader', 'ui/Notice', 'ui/Spinner', 'assistant/AskAiButton', 'compute/ComputeGates', 'notebook/NotebookFiles', 'notebook/NotebookCapture', 'notebook/NotebookSessionBar', 'jobs/JobReportPanel']) {
    modules[`@/components/${path}.vue`] = moduleDefault(Slotted)
  }
  modules['@/components/ui/Dialog.vue'] = moduleDefault(defineComponent({ props: ['open'], setup: (props, { slots }) => () => props.open ? h('dialog', {}, slots.default?.()) : null }))
  vi.stubGlobal('document', { getElementById: () => null, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  const component = compileClientComponent(new URL('./NotebookView.vue', import.meta.url), modules)
  const { root, app } = await mountApp(component)
  return { root, app, moveCell, addCell, activeCellId, ended, cells, addAttachment, notebook }
}

afterEach(() => vi.unstubAllGlobals())

describe('notebook workspace controls', () => {
  it('shows the save state in the toolbar and saves on leave', async () => {
    const { root, app, notebook } = await render()
    notebook.lastSavedMs.value = 1
    await flush()
    expect(content(root)).toContain('Saved now')
    notebook.saveError.value = 'offline'
    await flush()
    expect(content(root)).toContain('Save failed')
    expect(content(root)).not.toContain('were restored')
    expect(notebook.flushSave).not.toHaveBeenCalled()
    app.unmount()
    expect(notebook.flushCopy).toHaveBeenCalledOnce()
    expect(notebook.flushSave).toHaveBeenCalledOnce()
  })

  it('keeps the files header in the toolbar band and folds the column away', async () => {
    const { root, app } = await render()
    const band = element(root, (node) => String(node.props.class).includes('sticky'))
    expect(content(band)).toContain('Files')
    expect(element(band, (node) => node.props.label === 'Refresh kernel files')).toBeTruthy()
    const grid = band.parent!
    expect(String(grid.props.class)).toContain('18rem')
    const files = element(band, (node) => String(node.props.class).includes('xl:w-[18rem]'))
    expect(String(band.props.class)).toContain('flex-wrap')
    await click(element(files, (node) => node.props.label === 'Hide files'))
    expect(String(grid.props.class)).toContain('grid-cols-[minmax(0,1fr)]')
    expect(() => element(band, (node) => String(node.props.class).includes('xl:w-[18rem]'))).toThrow()
    expect(content(band)).not.toContain('Files')
    const show = element(band, (node) => node.tag === 'button')
    expect(show.props.label).toBe('Show files')
    await click(show)
    expect(element(band, (node) => node.props.label === 'Hide files')).toBeTruthy()
    app.unmount()
  })

  it('adds a code cell from the toolbar', async () => {
    const { root, app, addCell, activeCellId } = await render()
    await click(button(root, 'Add cell'))
    expect(addCell).toHaveBeenCalledWith('code', undefined)
    expect(activeCellId.value).toBe('new-cell')
    app.unmount()
  })

  it('inserts a cell below the row whose header emitted the action', async () => {
    const { root, app, addCell } = await render()
    await click(button(root, 'Add below b'))
    expect(addCell).toHaveBeenCalledWith('code', 2)
    app.unmount()
  })

  it('opens the completed report only in its modal', async () => {
    const { root, app, ended } = await render()
    expect(() => element(root, (node) => node.tag === 'dialog')).toThrow()
    ended.value = true
    await flush()
    await click(element(root, (node) => node.props.label === 'Session report'))
    expect(element(root, (node) => node.tag === 'dialog')).toBeTruthy()
    app.unmount()
  })

  it.each([false, true])('drops PNG into a Markdown cell or creates one: existing=%s', async (existing) => {
    vi.stubGlobal('FileReader', class {
      result = 'data:image/png;base64,AA=='
      onload?: () => void
      readAsDataURL() { this.onload?.() }
    })
    const { root, app, cells, addCell, addAttachment } = await render()
    if (existing) cells.value[1].cell_type = 'markdown'
    const destination = element(root, (node) => node.props.id === 'notebook-cell-b')
    ;(destination.props.onDrop as (event: unknown) => void)({ dataTransfer: { files: [{ name: 'plot.png', type: 'image/png' }] }, preventDefault: vi.fn(), stopPropagation: vi.fn() })
    await flush()
    expect(addAttachment).toHaveBeenCalledWith(existing ? 'b' : 'new-cell', 'plot.png', 'AA==')
    if (existing) expect(addCell).not.toHaveBeenCalled()
    else expect(addCell).toHaveBeenCalledWith('markdown', 2)
    app.unmount()
  })

  it('clears cell selection only for clicks outside cells', async () => {
    const { app, activeCellId } = await render()
    const listener = vi.mocked(document.addEventListener).mock.calls.find(([type]) => type === 'click')![1] as (event: unknown) => void
    listener({ target: { closest: () => ({}) } })
    expect(activeCellId.value).toBe('a')
    listener({ target: { closest: () => null } })
    expect(activeCellId.value).toBe('')
    app.unmount()
    expect(document.removeEventListener).toHaveBeenCalledWith('click', listener, true)
  })

  it('locks and unlocks Markdown for presentation', async () => {
    const { root, app } = await render()
    await click(element(root, (node) => node.props.label === 'Lock Markdown'))
    expect(element(root, (node) => node.props.locked === true)).toBeTruthy()
    await click(element(root, (node) => node.props.label === 'Unlock Markdown'))
    expect(element(root, (node) => node.props.locked === false)).toBeTruthy()
    app.unmount()
  })

  it.each([['a', 'c', 100, 2], ['c', 'a', 0, -2]])('drops %s relative to %s', async (id, target, y, offset) => {
    const { root, app, moveCell } = await render()
    const drag = button(root, `Drag ${id}`)
    ;(drag.props.onDragstart as (event: unknown) => void)({ dataTransfer: { setData: vi.fn() } })
    const destination = element(root, (node) => node.props.id === `notebook-cell-${target}`)
    const event = { currentTarget: { getBoundingClientRect: () => ({ top: 0, height: 100 }) }, clientY: y, preventDefault: vi.fn(), stopPropagation: vi.fn() }
    ;(destination.props.onDragover as (event: unknown) => void)(event)
    await flush()
    ;(destination.props.onDrop as (event: unknown) => void)(event)
    expect(moveCell).toHaveBeenCalledWith(id, offset)
    app.unmount()
  })

  it('ignores drops that did not begin on a notebook cell', async () => {
    const { root, app, moveCell } = await render()
    const destination = element(root, (node) => node.props.id === 'notebook-cell-a')
    ;(destination.props.onDrop as (event: unknown) => void)({ preventDefault: vi.fn(), stopPropagation: vi.fn() })
    expect(moveCell).not.toHaveBeenCalled()
    app.unmount()
  })
})
