import * as VueRuntime from 'vue'
import { defineComponent, h, reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, element, flush, mountApp, moduleDefault, typeValue } from '@/test/clientRender'
import * as Api from '@/lib/api'
import * as CursorPage from '@/composables/useCursorPage'
import * as Organize from '@/lib/organize'
import * as Utils from '@/lib/utils'

const previewMove = vi.fn()
const startMove = vi.fn()
const offline = ref(false)

const Slot = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const InputStub = defineComponent({
  props: { modelValue: String },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h('input', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    }),
})
const ListStub = defineComponent({
  props: { total: Number, offset: Number, shown: Number, filter: String, hasNext: Boolean, hasPrev: Boolean, complete: Boolean },
  emits: ['next', 'prev', 'filter'],
  setup: (props, { emit, slots }) => () =>
    h('div', [
      h('ul', slots.default?.()),
      h('span', `shown ${props.shown} of ${props.total}`),
      h('button', { onClick: () => emit('next') }, 'next page'),
      h('button', { onClick: () => emit('filter', 'x') }, 'filter x'),
    ]),
})

const MoveStep = compileClientComponent(new URL('./MoveStep.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/storage/PagedList.vue': moduleDefault(ListStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(Slot),
  '@/composables/useCursorPage': CursorPage,
  '@/composables/useAruna': {
    isUnsupportedEndpoint: (err: { status?: number }) => err?.status === 404,
    useAruna: () => ({ apiBaseUrl: ref('https://api.test'), authToken: ref('t'), sessionEpoch: ref(0) }),
  },
  '@/lib/connectivity': { OFFLINE_WRITE_HINT: 'offline', useConnectivity: () => ({ writesDisabled: offline }) },
  '@/lib/api': { ...Api, previewMove, startMove },
  '@/lib/organize': Organize,
  '@/lib/utils': Utils,
})

const PLAN = {
  total: 214880,
  complete: true,
  items: [{ from: 'X1.faa.gz', to: 'proteins/X1.faa.gz', conflict: 'name already used' }],
  next: 'c1',
}

async function mount() {
  const events: string[] = []
  const mounted = await mountApp(MoveStep, {
    props: {
      groupId: 'g1',
      link: { import_id: 'i1' },
      onStarted: () => events.push('started'),
      onUnsupported: () => events.push('unsupported'),
    },
  })
  await flush()
  if (mounted.errors.length) throw mounted.errors[0]
  return { ...mounted, events }
}

function field(root: Parameters<typeof content>[0], label: string) {
  return element(root, (node) => node.tag === 'input' && node.props['aria-label'] === label)
}

async function fill(root: Parameters<typeof content>[0]) {
  await typeValue(field(root, 'Files to move'), '*.faa.gz')
  await typeValue(field(root, 'New name'), 'proteins/{name}')
}

beforeEach(() => {
  offline.value = false
  previewMove.mockReset().mockResolvedValue(PLAN)
  startMove.mockReset().mockResolvedValue({})
})

describe('MoveStep', () => {
  it('needs a name with {name} before it previews', async () => {
    const { root } = await mount()
    await typeValue(field(root, 'Files to move'), '*.faa.gz')
    await typeValue(field(root, 'New name'), 'proteins/')
    expect(content(root)).toContain('The new name needs {name}')
    expect(button(root, 'Preview').props.disabled).toBe(true)
  })

  it('previews, counts and pages by cursor', async () => {
    const { root } = await mount()
    await fill(root)
    await click(button(root, 'Preview'))
    expect(previewMove).toHaveBeenCalledWith(
      'g1',
      'i1',
      { pattern: '*.faa.gz', target: 'proteins/{name}', from: '', subfolders: false },
      { filter: '', limit: 100, after: null },
      expect.anything(),
    )
    expect(content(root)).toContain('214,880 files match. Files that cannot move stay where they are.')
    expect(content(root)).toContain('DRS links by content keep working')
    expect(content(root)).toContain('proteins/X1.faa.gz (name already used)')
    expect(button(root, 'Move 214,880 files')).toBeTruthy()

    await click(button(root, 'next page'))
    expect(previewMove).toHaveBeenLastCalledWith('g1', 'i1', expect.anything(), { filter: '', limit: 100, after: 'c1' }, expect.anything())
    await click(button(root, 'filter x'))
    expect(previewMove).toHaveBeenLastCalledWith('g1', 'i1', expect.anything(), { filter: 'x', limit: 100, after: null }, expect.anything())
  })

  it('names a lower bound and sends a folder', async () => {
    previewMove.mockResolvedValue({ ...PLAN, complete: false })
    const { root } = await mount()
    await fill(root)
    await typeValue(field(root, 'Only in folder'), 'raw/')
    await click(button(root, 'Preview'))
    expect(content(root)).toContain('At least 214,880 files match.')
    expect(previewMove).toHaveBeenCalledWith(
      'g1',
      'i1',
      { pattern: '*.faa.gz', target: 'proteins/{name}', from: 'raw/', subfolders: false },
      expect.anything(),
      expect.anything(),
    )
  })

  it('keeps the whole scope count on the button while a name filter is used', async () => {
    const { root } = await mount()
    await fill(root)
    await click(button(root, 'Preview'))
    previewMove.mockResolvedValue({ ...PLAN, total: 3 })
    await click(button(root, 'filter x'))
    expect(content(root)).toContain('shown 1 of 3')
    expect(button(root, 'Move 214,880 files')).toBeTruthy()
  })

  it('locks the fields while the move is being accepted', async () => {
    let accept: (value: unknown) => void = () => {}
    startMove.mockReturnValueOnce(new Promise((resolve) => (accept = resolve)))
    const { root, events } = await mount()
    await fill(root)
    const pending = click(button(root, 'Move files'))
    await flush()
    expect(field(root, 'Files to move').props.disabled).toBe(true)
    accept({})
    await pending
    expect(events).toEqual(['started'])
  })

  it('ignores a start accepted for the link that was left', async () => {
    let accept: (value: unknown) => void = () => {}
    startMove.mockReturnValueOnce(new Promise((resolve) => (accept = resolve)))
    const events: string[] = []
    const props = reactive({ groupId: 'g1', link: { import_id: 'i1' }, onStarted: () => events.push('started') })
    const mounted = await mountApp(defineComponent(() => () => h(MoveStep, props)))
    await flush()
    await fill(mounted.root)
    const pending = click(button(mounted.root, 'Move files'))
    await flush()
    props.link = { import_id: 'i2' }
    await flush()
    accept({})
    await pending
    expect(events).toEqual([])
    expect(field(mounted.root, 'Files to move').props.disabled).toBe(false)
  })

  it('does not start while the node reports another step', async () => {
    previewMove.mockResolvedValue({ ...PLAN, blocked: true })
    const { root } = await mount()
    await fill(root)
    await click(button(root, 'Preview'))
    expect(content(root)).toContain('Another step is running.')
    expect(button(root, 'Move 214,880 files').props.disabled).toBe(true)
  })

  it('shows a refusal in short words', async () => {
    startMove.mockRejectedValue(new Api.ApiError(409, 'busy', 'job_running'))
    const { root } = await mount()
    await fill(root)
    await click(button(root, 'Move files'))
    expect(content(root)).toContain('Another step is running.')
  })

  it('starts without a preview', async () => {
    const { root, events } = await mount()
    await fill(root)
    await click(button(root, 'Move files'))
    expect(startMove).toHaveBeenCalledWith('g1', 'i1', { pattern: '*.faa.gz', target: 'proteins/{name}', from: '', subfolders: false }, expect.anything())
    expect(previewMove).not.toHaveBeenCalled()
    expect(events).toEqual(['started'])
  })

  it('drops the preview when a field changes', async () => {
    const { root } = await mount()
    await fill(root)
    await click(button(root, 'Preview'))
    await typeValue(field(root, 'Files to move'), '*.fna.gz')
    expect(content(root)).not.toContain('will move')
  })

  it('reports an older node and does not start offline', async () => {
    previewMove.mockRejectedValue({ status: 404 })
    const { root, events } = await mount()
    await fill(root)
    await click(button(root, 'Preview'))
    expect(events).toEqual(['unsupported'])
    offline.value = true
    await flush()
    expect(button(root, 'Move files').props.disabled).toBe(true)
  })
})
