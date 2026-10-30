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

const boxWidth = ref(0)
const icons = new Proxy({}, { get: () => defineComponent(() => () => null) })
const SearchHint = compileClientComponent(new URL('./SearchHint.vue', import.meta.url), { vue: VueRuntime, '@lucide/vue': icons })
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
  '@/components/ui/Tooltip.vue': moduleDefault(Plain),
  '@/lib/objectListing': ObjectListing,
  '@/components/data/manager/SearchHint.vue': moduleDefault(SearchHint),
  '@vueuse/core': { useDebounceFn, useElementSize: () => ({ width: boxWidth }) },
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
    bucket: ref('laptop'),
    prefix: ref('results/bakta/final'),
  }
}

async function mount(wholeBucket = false, listShow = 'all') {
  const state = manager()
  state.listShow.value = listShow
  const text = ref('')
  const hinting = ref(false)
  const events: string[] = []
  const bucket = ref(wholeBucket)
  const Host = defineComponent(() => () =>
    h(ObjectListBar, {
      manager: state,
      text: text.value,
      wholeBucket: bucket.value,
      'onUpdate:text': (value: string) => (text.value = value),
      'onUpdate:hinting': (value: boolean) => (hinting.value = value),
      onSearchBucket: () => events.push('search-bucket'),
      onBack: () => events.push('back'),
    }))
  const mounted = await mountApp(Host)
  const input = () => element(mounted.root, (node) => node.tag === 'input')
  const type = async (value: string) => {
    ;(input().props['onUpdate:modelValue'] as (next: string) => void)(value)
    await flush()
  }
  const form = () => element(mounted.root, (node) => node.tag === 'form')
  const focus = async (on: boolean) => {
    ;(form().props[on ? 'onFocusin' : 'onFocusout'] as () => void)()
    await flush()
  }
  return { mounted, state, text, hinting, events, bucket, input, type, focus }
}

describe('the one search box of the file list', () => {
  it('is one box that says both what it filters and what Enter does', async () => {
    const { mounted } = await mount()
    const boxes = nodes(mounted.root).filter((node) => node.tag === 'input')
    expect(boxes).toHaveLength(1)
    expect(boxes[0].props.placeholder).toBe('Search files')
    expect(boxes[0].props['aria-label']).toBe('Filter this folder or search the bucket')
    mounted.app.unmount()
  })

  it('says only Search in a narrow box', async () => {
    boxWidth.value = 120
    try {
      const { mounted, input } = await mount()
      expect(input().props.placeholder).toBe('Search')
      mounted.app.unmount()
    } finally {
      boxWidth.value = 0
    }
  })

  it('explains while typing what the text filters and what Enter does', async () => {
    const { mounted, hinting, type, focus } = await mount()
    await focus(true)
    expect(hinting.value).toBe(false)
    await type('gff')
    const text = content(mounted.root)
    expect(text).toContain('Filtering final for "gff"')
    expect(text).toContain('Press Enter to search all of laptop. Use column=value for an exact match')
    expect(hinting.value).toBe(true)

    await type('organism=coli')
    expect(content(mounted.root)).toContain('Press Enter to search all of laptop for organism=coli.')
    expect(content(mounted.root)).not.toContain('Filtering')

    await focus(false)
    expect(hinting.value).toBe(false)
    expect(content(mounted.root)).not.toContain('Press Enter')
    mounted.app.unmount()
  })

  it('shows no hint during a bucket search', async () => {
    const { mounted, hinting, type, focus } = await mount(true)
    await focus(true)
    await type('coli')
    expect(hinting.value).toBe(false)
    expect(content(mounted.root)).not.toContain('Press Enter')
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
