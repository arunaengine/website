import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, element, flush, mountApp, moduleDefault, typeValue } from '@/test/clientRender'
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
  props: { total: Number, offset: Number, shown: Number, filter: String },
  emits: ['page', 'filter'],
  setup: (props, { emit, slots }) => () =>
    h('div', [
      h('ul', slots.default?.()),
      h('span', `range ${props.offset}+${props.shown} of ${props.total}`),
      h('button', { onClick: () => emit('page', 100) }, 'next page'),
      h('button', { onClick: () => emit('filter', 'x') }, 'filter x'),
    ]),
})

const MoveStep = compileClientComponent(new URL('./MoveStep.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/storage/PagedList.vue': moduleDefault(ListStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(Slot),
  '@/composables/useAruna': {
    isUnsupportedEndpoint: (err: { status?: number }) => err?.status === 404,
    useAruna: () => ({ apiBaseUrl: ref('https://api.test'), authToken: ref('t'), sessionEpoch: ref(0) }),
  },
  '@/lib/connectivity': { OFFLINE_WRITE_HINT: 'offline', useConnectivity: () => ({ writesDisabled: offline }) },
  '@/lib/api': { PAGE_SIZE: 100, previewMove, startMove },
  '@/lib/organize': Organize,
  '@/lib/utils': Utils,
})

const PLAN = {
  total: 214880,
  taken: 2,
  items: [{ from: 'X1.faa.gz', to: 'proteins/X1.faa.gz', taken: true }],
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

  it('previews, counts what moves and pages', async () => {
    const { root } = await mount()
    await fill(root)
    await click(button(root, 'Preview'))
    expect(previewMove).toHaveBeenCalledWith(
      'g1',
      'i1',
      { pattern: '*.faa.gz', target: 'proteins/{name}' },
      { offset: 0, limit: 100, filter: '', onlyTaken: false },
      expect.anything(),
    )
    expect(content(root)).toContain('214,878 files will move.')
    expect(content(root)).toContain('2 names are taken and stay.')
    expect(content(root)).toContain('proteins/X1.faa.gz (taken)')
    expect(button(root, 'Move 214,878 files')).toBeTruthy()

    await click(button(root, 'next page'))
    expect(previewMove).toHaveBeenLastCalledWith('g1', 'i1', expect.anything(), { offset: 100, limit: 100, filter: '', onlyTaken: false }, expect.anything())
    await click(button(root, 'taken'))
    expect(previewMove).toHaveBeenLastCalledWith('g1', 'i1', expect.anything(), { offset: 0, limit: 100, filter: '', onlyTaken: true }, expect.anything())
  })

  it('starts without a preview', async () => {
    const { root, events } = await mount()
    await fill(root)
    await click(button(root, 'Move files'))
    expect(startMove).toHaveBeenCalledWith('g1', 'i1', { pattern: '*.faa.gz', target: 'proteins/{name}' }, expect.anything())
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
