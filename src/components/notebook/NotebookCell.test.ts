import * as VueRuntime from 'vue'
import { defineComponent, h, reactive, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as Nbformat from '@/lib/notebook/nbformat'
import * as Outputs from '@/lib/notebook/outputs'
import * as Runtimes from '@/lib/notebook/runtimes'
import { button, click, compileClientComponent, content, element, flush, moduleDefault, mountApp } from '@/test/clientRender'

async function render(kind: Nbformat.CellKind, source: string, markdownLocked = false) {
  const cell = reactive(Nbformat.newCell(kind, source))
  const activeCellId = ref(cell.id)
  const lastSavedMs = ref(0)
  const dirty = ref(false)
  const runCell = vi.fn()
  const setSource = vi.fn()
  const setCellType = vi.fn()
  const drag = vi.fn()
  const Slotted = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
  const Editor = defineComponent({ props: ['modelValue', 'language'], setup: (props) => () => h('textarea', { value: props.modelValue, language: props.language }) })
  const component = compileClientComponent(new URL('./NotebookCell.vue', import.meta.url), {
    vue: { ...VueRuntime, defineAsyncComponent: () => Editor },
    '@lucide/vue': new Proxy({}, { get: () => Slotted }),
    '@/components/ui/Select.vue': moduleDefault(defineComponent({ props: ['modelValue', 'options'], emits: ['update:modelValue'], setup: (props, { emit }) => () => h('select', { value: props.modelValue, options: props.options, onChange: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value) }) })),
    '@/components/ui/Badge.vue': moduleDefault(Slotted),
    '@/components/ui/Button.vue': moduleDefault(Slotted),
    '@/components/ui/IconButton.vue': moduleDefault(Slotted),
    '@/components/assistant/AssistantMarkdown.vue': moduleDefault(defineComponent({ props: ['text', 'imageSources'], setup: (props) => () => h('article', { images: props.imageSources }, props.text) })),
    '@/components/notebook/NotebookOutputs.vue': moduleDefault(Slotted),
    '@/components/notebook/NotebookPipelineCell.vue': moduleDefault(Slotted),
    '@/composables/notebookContext': { injectNotebook: () => ({
      notebook: { activeCellId, lastSavedMs, dirty, meta: ref({ runtime: 'python-notebook' }), selectCell: vi.fn(), setSource, setCellType },
      session: { cellStates: ref({}), live: ref(true), runCell },
    }) },
    '@/lib/chunk-recovery': { asyncChunkError: vi.fn() },
    '@/lib/notebook/nbformat': Nbformat,
    '@/lib/notebook/runtimes': Runtimes,
    '@/lib/notebook/outputs': Outputs,
  })
  const { root, app } = await mountApp(defineComponent({ setup: () => () => h(component, { cell, index: 0, markdownLocked, onDragCell: drag }) }))
  return { root, app, cell, activeCellId, runCell, drag, lastSavedMs, dirty, setCellType }
}

describe('notebook cells', () => {
  it('edits Markdown on focus and renders on blur', async () => {
    const { root, app } = await render('markdown', '# Heading')
    expect(content(element(root, (node) => node.tag === 'article'))).toBe('# Heading')
    ;(element(root, (node) => 'data-markdown-preview' in node.props).props.onFocus as (event: unknown) => void)({ target: null })
    await flush()
    ;(element(root, (node) => typeof node.props.onFocusout === 'function').props.onFocusout as (event: unknown) => void)({ target: { hasAttribute: () => true }, currentTarget: { contains: () => false }, relatedTarget: null })
    await flush()
    expect(element(root, (node) => node.tag === 'textarea').props.value).toBe('# Heading')
    ;(element(root, (node) => typeof node.props.onFocusout === 'function').props.onFocusout as (event: unknown) => void)({ currentTarget: { contains: () => false }, relatedTarget: null })
    await flush()
    expect(element(root, (node) => node.tag === 'article')).toBeTruthy()
    app.unmount()
  })

  it.each([false, true])('renders after saving unless newer edits remain: dirty=%s', async (newerEdits) => {
    const { root, app, lastSavedMs, dirty } = await render('markdown', '# Saved')
    ;(element(root, (node) => 'data-markdown-preview' in node.props).props.onFocus as (event: unknown) => void)({ target: null })
    await flush()
    dirty.value = newerEdits
    lastSavedMs.value = 1
    await flush()
    expect(element(root, (node) => node.tag === (newerEdits ? 'textarea' : 'article'))).toBeTruthy()
    app.unmount()
  })

  it('renders a new Markdown cell when another cell is selected', async () => {
    const { root, app, cell, activeCellId } = await render('markdown', '')
    cell.source = '**Written text**'
    activeCellId.value = 'another'
    await flush()
    expect(content(element(root, (node) => node.tag === 'article'))).toBe('**Written text**')
    app.unmount()
  })

  it('edits ordinary Bash and executes its portable IPython cell', async () => {
    const { root, app, cell, runCell } = await render('code', '%%bash\necho hello')
    const editor = element(root, (node) => node.tag === 'textarea')
    expect(editor.props.value).toBe('echo hello')
    expect(editor.props.language).toBe('shell')
    await click(button(root, 'Run'))
    expect(runCell).toHaveBeenCalledWith(cell.id, '%%bash\necho hello')
    app.unmount()
  })

  it('resolves imported Markdown image attachments', async () => {
    const { root, app, cell } = await render('markdown', '![plot](attachment:plot.png)')
    cell.attachments = { 'plot.png': { 'image/png': 'iVBORw0KGgo=' } }
    await flush()
    expect(element(root, (node) => node.tag === 'article').props.images).toEqual({ 'attachment:plot.png': 'data:image/png;base64,iVBORw0KGgo=' })
    app.unmount()
  })

  it('resizes Markdown from its separate handle with a minimum height', async () => {
    const { root, app } = await render('markdown', '# Resize')
    await click(element(root, (node) => 'data-markdown-preview' in node.props))
    const handle = element(root, (node) => node.props['aria-label'] === 'Resize Markdown cell')
    const capture = vi.fn()
    ;(handle.props.onPointerdown as (event: unknown) => void)({ button: 0, clientY: 100, pointerId: 1, currentTarget: { setPointerCapture: capture }, preventDefault: vi.fn() })
    ;(handle.props.onPointermove as (event: unknown) => void)({ clientY: 180 })
    await flush()
    expect(element(root, (node) => node.tag === 'textarea').props.style).toEqual({ height: '192px' })
    ;(handle.props.onPointermove as (event: unknown) => void)({ clientY: -100 })
    await flush()
    expect(element(root, (node) => node.tag === 'textarea').props.style).toEqual({ height: '80px' })
    expect(capture).toHaveBeenCalledWith(1)
    app.unmount()
  })

  it('keeps locked Markdown rendered when focused or clicked', async () => {
    const { root, app } = await render('markdown', '# Showcase', true)
    const preview = element(root, (node) => 'data-markdown-preview' in node.props)
    ;(preview.props.onFocus as (event: unknown) => void)({ target: null })
    await click(preview)
    expect(content(element(root, (node) => node.tag === 'article'))).toBe('# Showcase')
    expect(preview.props.tabindex).toBe(-1)
    app.unmount()
  })

  it('changes a cell type from its header', async () => {
    const { root, app, cell, setCellType } = await render('code', 'print(1)')
    const select = element(root, (node) => node.tag === 'select')
    ;(select.props.onChange as (event: unknown) => void)({ target: { value: 'markdown' } })
    expect(setCellType).toHaveBeenCalledWith(cell.id, 'markdown')
    expect(select.props.options).not.toContainEqual({ value: 'pipeline', label: 'Pipeline' })
    app.unmount()
  })

  it('exposes a draggable handle without making cell text draggable', async () => {
    const { root, app, drag } = await render('code', 'print(1)')
    const handle = element(root, (node) => node.props.label === 'Drag to reorder cell')
    const event = { stopPropagation: vi.fn() }
    ;(handle.props.onDragstart as (event: unknown) => void)(event)
    expect(handle.props.draggable).toBe('true')
    expect(drag).toHaveBeenCalledWith(event)
    expect(element(root, (node) => node.tag === 'textarea').props.draggable).toBeUndefined()
    app.unmount()
  })
})
