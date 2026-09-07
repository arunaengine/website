import * as VueRuntime from 'vue'
import { defineComponent, h, reactive, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as Nbformat from '@/lib/notebook/nbformat'
import * as Outputs from '@/lib/notebook/outputs'
import * as Runtimes from '@/lib/notebook/runtimes'
import { button, click, compileClientComponent, content, element, flush, moduleDefault, mountApp } from '@/test/clientRender'

async function render(kind: Nbformat.CellKind, source: string) {
  const cell = reactive(Nbformat.newCell(kind, source))
  const activeCellId = ref(cell.id)
  const runCell = vi.fn()
  const setSource = vi.fn()
  const drag = vi.fn()
  const Slotted = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
  const Editor = defineComponent({ props: ['modelValue', 'language'], setup: (props) => () => h('textarea', { value: props.modelValue, language: props.language }) })
  const component = compileClientComponent(new URL('./NotebookCell.vue', import.meta.url), {
    vue: { ...VueRuntime, defineAsyncComponent: () => Editor },
    '@lucide/vue': new Proxy({}, { get: () => Slotted }),
    '@/components/ui/Badge.vue': moduleDefault(Slotted),
    '@/components/ui/Button.vue': moduleDefault(Slotted),
    '@/components/ui/IconButton.vue': moduleDefault(Slotted),
    '@/components/assistant/AssistantMarkdown.vue': moduleDefault(defineComponent({ props: ['text', 'imageSources'], setup: (props) => () => h('article', { images: props.imageSources }, props.text) })),
    '@/components/notebook/NotebookOutputs.vue': moduleDefault(Slotted),
    '@/components/notebook/NotebookPipelineCell.vue': moduleDefault(Slotted),
    '@/composables/notebookContext': { injectNotebook: () => ({
      notebook: { activeCellId, meta: ref({ runtime: 'python-notebook' }), selectCell: vi.fn(), setSource },
      session: { cellStates: ref({}), live: ref(true), runCell },
    }) },
    '@/lib/chunk-recovery': { asyncChunkError: vi.fn() },
    '@/lib/notebook/nbformat': Nbformat,
    '@/lib/notebook/runtimes': Runtimes,
    '@/lib/notebook/outputs': Outputs,
  })
  const { root, app } = await mountApp(defineComponent({ setup: () => () => h(component, { cell, index: 0, onDragCell: drag }) }))
  return { root, app, cell, activeCellId, runCell, drag }
}

describe('notebook cells', () => {
  it('renders Markdown and offers an explicit edit/render cycle', async () => {
    const { root, app } = await render('markdown', '# Heading')
    expect(content(element(root, (node) => node.tag === 'article'))).toBe('# Heading')
    await click(button(root, 'Edit Markdown'))
    expect(element(root, (node) => node.tag === 'textarea').props.value).toBe('# Heading')
    await click(button(root, 'Render Markdown'))
    expect(element(root, (node) => node.tag === 'article')).toBeTruthy()
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
