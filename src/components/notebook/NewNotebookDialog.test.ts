import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as NotebookDocument from '@/lib/notebook/document'
import { button, click, compileClientComponent, content, flush, input, moduleDefault, mountApp, typeValue } from '@/test/clientRender'

const context = ref<{ groupId: string } | null>(null)
const writable = ref(true)
const push = vi.fn()
const activateContext = vi.fn(async (_node: string | null, groupId: string) => {
  context.value = { groupId }
})

const Slotted = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const Button = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const Input = defineComponent({
  props: ['modelValue'],
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () => h('input', {
    ...attrs, value: props.modelValue,
    onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
  }),
})
const Dialog = defineComponent({
  props: { open: Boolean },
  setup: (props, { slots }) => () => (props.open ? h('section', slots.default?.()) : null),
})

const modules: Record<string, unknown> = {
  vue: VueRuntime,
  'vue-router': { useRouter: () => ({ push }) },
  '@/components/ui/Button.vue': moduleDefault(Button),
  '@/components/ui/Input.vue': moduleDefault(Input),
  '@/components/ui/Dialog.vue': moduleDefault(Dialog),
  '@/composables/useS3': {
    useS3: () => ({
      activeContext: context,
      activateContext,
      canRead: (bucket: string) => Boolean(bucket && context.value),
      canWrite: (bucket: string) => Boolean(bucket && writable.value),
    }),
  },
  '@/lib/notebook/document': NotebookDocument,
}
for (const name of ['DialogClose', 'DialogContent', 'DialogDescription', 'DialogFooter', 'DialogHeader', 'DialogTitle']) {
  modules[`@/components/ui/${name}.vue`] = moduleDefault(Slotted)
}
const dialog = compileClientComponent(new URL('./NewNotebookDialog.vue', import.meta.url), modules)

beforeEach(() => {
  context.value = { groupId: 'group-1' }
  writable.value = true
  push.mockReset()
  activateContext.mockClear()
})

async function render(prefix = '', nodeId: string | null = null) {
  const open = ref(true)
  const host = defineComponent({
    setup: () => () => h(dialog, {
      open: open.value,
      bucket: 'reef',
      prefix,
      groupId: 'group-1',
      nodeId,
      'onUpdate:open': (value: boolean) => { open.value = value },
    }),
  })
  const { root, app } = await mountApp(host)
  return { root, app, open }
}

describe('new notebook dialog', () => {
  it('creates the notebook in the folder on screen', async () => {
    const { root, app } = await render('notebooks/')
    expect(button(root, 'Open').props.disabled).toBe(true)
    await typeValue(input(root, 'aria-label', 'Notebook name'), 'First look')
    expect(content(root)).toContain('notebooks/first-look.ipynb')
    await click(button(root, 'Open'))
    expect(push).toHaveBeenCalledWith({
      name: 'notebook',
      params: { bucketId: 'reef', key: 'notebooks/first-look.ipynb' },
      query: { group: 'group-1' },
    })
    app.unmount()
  })

  it('creates at the bucket root when no folder is open', async () => {
    const { root, app } = await render()
    await typeValue(input(root, 'aria-label', 'Notebook name'), 'First look')
    await click(button(root, 'Open'))
    expect(push).toHaveBeenCalledWith(expect.objectContaining({
      params: { bucketId: 'reef', key: 'first-look.ipynb' },
    }))
    app.unmount()
  })

  it('blocks creation when write access is lost', async () => {
    const { root, app } = await render('notebooks/')
    await typeValue(input(root, 'aria-label', 'Notebook name'), 'Draft')
    writable.value = false
    await flush()
    expect(button(root, 'Open').props.disabled).toBe(true)
    await click(button(root, 'Open'))
    expect(push).not.toHaveBeenCalled()
    app.unmount()
  })

  it('opens the storage session of the bucket node when none is open yet', async () => {
    context.value = null
    const { root, app, open } = await render('notebooks/', 'node-2')
    await flush()
    expect(activateContext).toHaveBeenCalledWith('node-2', 'group-1')
    expect(open.value).toBe(true)
    await typeValue(input(root, 'aria-label', 'Notebook name'), 'First look')
    expect(button(root, 'Open').props.disabled).toBeFalsy()
    await click(button(root, 'Open'))
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ query: { group: 'group-1', node: 'node-2' } }))
    app.unmount()
  })

  it('closes when the storage session changes', async () => {
    const { root, app, open } = await render('notebooks/')
    await typeValue(input(root, 'aria-label', 'Notebook name'), 'Draft')
    context.value = null
    await flush()
    expect(open.value).toBe(false)
    expect(content(root)).not.toContain('The file is written on the first save')
    app.unmount()
  })
})
