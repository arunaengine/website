import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import * as ObjectListing from '@/lib/objectListing'
import { compileClientComponent, content, element, flush, moduleDefault, mountApp, nodes } from '@/test/clientRender'

const Plain = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const ButtonStub = defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()) })
const InputStub = defineComponent({
  props: { modelValue: String },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () => h('input', { ...attrs, value: props.modelValue, 'onUpdate:modelValue': (value: string) => emit('update:modelValue', value) }),
})

// The pause before a typed filter applies is over at once here.
const useDebounceFn = (fn: (value: string) => void) => Object.assign((value: string) => fn(value), { cancel: () => {} })

const ObjectListBar = compileClientComponent(new URL('./ObjectListBar.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/DropdownMenu.vue': moduleDefault(Plain),
  '@/components/ui/DropdownMenuContent.vue': moduleDefault(Plain),
  '@/components/ui/DropdownMenuItem.vue': moduleDefault(Plain),
  '@/components/ui/DropdownMenuLabel.vue': moduleDefault(Plain),
  '@/components/ui/DropdownMenuSeparator.vue': moduleDefault(Plain),
  '@/components/ui/DropdownMenuTrigger.vue': moduleDefault(Plain),
  '@/components/ui/IconButton.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/lib/objectListing': ObjectListing,
  '@vueuse/core': { useDebounceFn },
  '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => null) }),
})

function manager() {
  return {
    nameFilter: ref(''),
    listShow: ref('all'),
    resetFilters: () => {},
    showDeleted: ref(false),
    setShowDeleted: () => {},
    remoteNodeId: ref(null),
    activeGroupId: ref('g1'),
    selectedObjectKeys: ref(new Set()),
    selectedPrefixes: ref(new Set()),
    selectedCount: ref(0),
    clearSelection: () => {},
  }
}

async function mount(wholeBucket = false, listShow = 'all') {
  const state = manager()
  state.listShow.value = listShow
  const text = ref('')
  const events: string[] = []
  const bucket = ref(wholeBucket)
  const Host = defineComponent(() => () =>
    h(ObjectListBar, {
      manager: state,
      text: text.value,
      wholeBucket: bucket.value,
      'onUpdate:text': (value: string) => (text.value = value),
      onSearchBucket: () => events.push('search-bucket'),
      onBack: () => events.push('back'),
    }))
  const mounted = await mountApp(Host)
  const input = () => element(mounted.root, (node) => node.tag === 'input')
  const type = async (value: string) => {
    ;(input().props['onUpdate:modelValue'] as (next: string) => void)(value)
    await flush()
  }
  return { mounted, state, text, events, bucket, input, type }
}

describe('the one search box of the file list', () => {
  it('is one box that says both what it filters and what Enter does', async () => {
    const { mounted } = await mount()
    const boxes = nodes(mounted.root).filter((node) => node.tag === 'input')
    expect(boxes).toHaveLength(1)
    expect(boxes[0].props.placeholder).toBe('Filter this folder, Enter searches the bucket')
    expect(content(mounted.root)).not.toContain('Search names and details')
    mounted.app.unmount()
  })

  it('filters this folder while typing and asks for the whole bucket on Enter', async () => {
    const { mounted, state, events, type } = await mount()
    await type('GCF_0000')
    expect(state.nameFilter.value).toBe('GCF_0000')

    ;(element(mounted.root, (node) => node.tag === 'form').props.onSubmit as (event: Event) => void)({ preventDefault: () => {} } as Event)
    expect(events).toEqual(['search-bucket'])
    mounted.app.unmount()
  })

  it('never filters the folder by a column=value, which only the bucket search knows', async () => {
    const { mounted, state, type } = await mount()
    await type('coli')
    await type('coli species_taxid=562')
    expect(state.nameFilter.value).toBe('')
    mounted.app.unmount()
  })

  it('leaves the folder filter alone during a bucket search and goes back with Escape or the X', async () => {
    const { mounted, state, events, input, type } = await mount(true)
    await type('coli')
    expect(state.nameFilter.value).toBe('')

    ;(input().props.onKeydown as (event: KeyboardEvent) => void)({ key: 'Escape' } as KeyboardEvent)
    ;(element(mounted.root, (node) => node.props['aria-label'] === 'Clear filter').props.onClick as () => void)()
    expect(events).toEqual(['back', 'back'])
    mounted.app.unmount()
  })

  it('marks changed filters once, on the filter icon, without a second dot', async () => {
    const { mounted } = await mount(false, 'files')
    expect(nodes(mounted.root).some((node) => String(node.props.class ?? '').includes('rounded-full bg-primary'))).toBe(false)
    mounted.app.unmount()
  })
})
