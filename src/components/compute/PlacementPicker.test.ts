import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  input,
  moduleDefault,
  mountApp,
  nodes,
  typeValue,
} from '@/test/clientRender'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Utils from '@/lib/utils'

const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h('button', attrs, slots.default?.())
  },
})
const InputStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: { type: [String, Number], default: '' } },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () => h('input', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: unknown } }) =>
        emit('update:modelValue', String(event.target.value)),
    })
  },
})
const SelectStub = defineComponent({
  inheritAttrs: false,
  props: {
    modelValue: { type: String, required: true },
    options: { type: Array, default: () => [] },
  },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () => h(
      'select',
      {
        ...attrs,
        value: props.modelValue,
        onInput: (event: { target: { value: unknown } }) =>
          emit('update:modelValue', String(event.target.value)),
      },
      (props.options as Array<{ value: string; label: string }>).map((option) =>
        h('option', { value: option.value }, option.label),
      ),
    )
  },
})

const NoticeStub = defineComponent({
  props: { tone: String, title: String },
  setup: (props, { slots }) => () => h('div', [h('p', props.title), slots.default?.()]),
})

const realmError = ref<string | null>(null)
const loadInfo = vi.fn(async () => undefined)

const NODE_FIXTURES = [
  {
    nodeId: '01NODEALPHA1234567890',
    label: 'Alpha',
    executorKinds: ['docker'],
    info: {
      labels: {
        region: 'eu-central',
        zone: 'a',
        'aruna-engine.org/node': '01NODEALPHA1234567890',
      },
    },
  },
  {
    nodeId: '01NODEBETA1234567890',
    label: 'Beta',
    executorKinds: ['slurm'],
    info: { labels: { region: 'eu-central', tier: 'fast' } },
  },
  {
    nodeId: '01STORAGE1234567890',
    label: 'Storage only',
    executorKinds: [],
    info: { labels: { storage: 'hot' } },
  },
]
const realmNodes = ref(NODE_FIXTURES)

const PlacementPicker = compileClientComponent(new URL('./PlacementPicker.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => h('i')) }),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(NoticeStub),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/composables/useAruna': { useAruna: () => ({ error: realmError, loadInfo }) },
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ nodes: realmNodes }) },
  '@/lib/utils': Utils,
})

async function mount() {
  let model: Record<string, string> = {}
  const Harness = defineComponent(() => {
    const labels = ref<Record<string, string>>({})
    return () => h(PlacementPicker, {
      modelValue: labels.value,
      'onUpdate:modelValue': (value: Record<string, string>) => {
        labels.value = value
        model = value
      },
    })
  })
  return { ...(await mountApp(Harness)), model: () => model }
}

describe('PlacementPicker', () => {
  beforeEach(() => {
    realmError.value = null
    realmNodes.value = NODE_FIXTURES
    loadInfo.mockClear()
  })

  it('pins a node and adds and removes free-form label pairs', async () => {
    const mounted = await mount()
    const nodeSelect = element(
      mounted.root,
      (node) => node.tag === 'select' && node.props['aria-label'] === 'Run on node',
    )

    expect(content(nodeSelect)).toContain('Alpha · 01NODEAL…7890')
    expect(content(nodeSelect)).not.toContain('Storage only')
    await typeValue(nodeSelect, '01NODEALPHA1234567890')

    expect(mounted.model()).toEqual({
      'aruna-engine.org/node': '01NODEALPHA1234567890',
    })

    await click(button(mounted.root, 'Add constraint'))
    await typeValue(input(mounted.root, 'aria-label', 'Label key 1'), 'region')
    await typeValue(input(mounted.root, 'aria-label', 'Label value 1'), 'eu-west')
    await click(button(mounted.root, 'Add constraint'))
    await typeValue(input(mounted.root, 'aria-label', 'Label key 2'), 'tier')
    await typeValue(input(mounted.root, 'aria-label', 'Label value 2'), 'fast')

    expect(mounted.model()).toEqual({
      'aruna-engine.org/node': '01NODEALPHA1234567890',
      region: 'eu-west',
      tier: 'fast',
    })

    await click(element(
      mounted.root,
      (node) => node.tag === 'button' && node.props['aria-label'] === 'Remove label constraint 1',
    ))
    expect(mounted.model()).toEqual({
      'aruna-engine.org/node': '01NODEALPHA1234567890',
      tier: 'fast',
    })
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('deduplicates advertised key-value suggestions and excludes derived labels', async () => {
    const mounted = await mount()
    const datalist = element(
      mounted.root,
      (node) =>
        node.tag === 'datalist' && String(node.props.id).startsWith('placement-label-keys-'),
    )
    const values = nodes(datalist)
      .filter((node) => node.tag === 'option')
      .map((node) => node.props.value)

    expect(values.filter((value) => value === 'region')).toHaveLength(1)
    expect(values).toContain('storage')
    expect(values).not.toContain('aruna-engine.org/node')
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('offers a retry when the realm nodes could not be loaded', async () => {
    realmError.value = 'Realm info is unavailable.'
    realmNodes.value = []
    const mounted = await mount()

    expect(content(mounted.root)).toContain('Realm info is unavailable.')
    await click(button(mounted.root, 'Try again'))

    expect(loadInfo).toHaveBeenCalledTimes(1)
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })
})
