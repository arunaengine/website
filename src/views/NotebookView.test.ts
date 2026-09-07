import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Runtimes from '@/lib/notebook/runtimes'
import { newCell } from '@/lib/notebook/nbformat'
import { button, click, compileClientComponent, element, flush, moduleDefault, mountApp } from '@/test/clientRender'

async function render() {
  const cells = ref(['a', 'b', 'c'].map((id) => ({ ...newCell('code', id), id })))
  const activeCellId = ref('a')
  const moveCell = vi.fn()
  const addCell = vi.fn(() => ({ ...newCell('code'), id: 'new-cell' }))
  const notebook = {
    cells, activeCellId, moveCell, addCell,
    selectCell: (id: string) => { activeCellId.value = id },
    name: ref('analysis'), meta: ref({ runtime: 'python-notebook', group_id: 'group', workspace_bucket: 'lab' }),
    scope: ref('account'), generation: ref(1),
    saving: ref(false), loading: ref(false), dirty: ref(false), restoredCopy: ref(false),
    loadError: ref(null), saveError: ref(null), loadDenied: ref(false), lastSavedMs: ref(0),
    load: vi.fn(async () => {}), autosave: vi.fn(), save: vi.fn(),
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
      detach: vi.fn(), attachSaved: vi.fn(), live: ref(true), ended: ref(false), jobId: ref('job'), runCells: vi.fn(),
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
  for (const path of ['dashboard/PageHeader', 'ui/Notice', 'ui/Spinner', 'assistant/AskAiButton', 'compute/ComputeGates', 'notebook/NotebookFiles', 'notebook/NotebookSessionBar', 'jobs/JobReportPanel']) {
    modules[`@/components/${path}.vue`] = moduleDefault(Slotted)
  }
  vi.stubGlobal('document', { getElementById: () => null, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  const component = compileClientComponent(new URL('./NotebookView.vue', import.meta.url), modules)
  const { root, app } = await mountApp(component)
  return { root, app, moveCell, addCell, activeCellId }
}

afterEach(() => vi.unstubAllGlobals())

describe('notebook workspace controls', () => {
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
    const event = { currentTarget: { getBoundingClientRect: () => ({ top: 0, height: 100 }) }, clientY: y, preventDefault: vi.fn() }
    ;(destination.props.onDragover as (event: unknown) => void)(event)
    await flush()
    ;(destination.props.onDrop as (event: unknown) => void)(event)
    expect(moveCell).toHaveBeenCalledWith(id, offset)
    app.unmount()
  })

  it('ignores drops that did not begin on a notebook cell', async () => {
    const { root, app, moveCell } = await render()
    const destination = element(root, (node) => node.props.id === 'notebook-cell-a')
    ;(destination.props.onDrop as (event: unknown) => void)({ preventDefault: vi.fn() })
    expect(moveCell).not.toHaveBeenCalled()
    app.unmount()
  })
})
