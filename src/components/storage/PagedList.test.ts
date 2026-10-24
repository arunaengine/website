import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { button, compileClientComponent, click, content, element, flush, mountApp, moduleDefault } from '@/test/clientRender'
import * as Organize from '@/lib/organize'

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
const PagedList = compileClientComponent(new URL('./PagedList.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Spinner.vue': moduleDefault(defineComponent({ props: { label: String }, setup: (p) => () => h('i', p.label) })),
  '@/lib/organize': Organize,
})

async function mount(offset: number, shown: number, total: number, hasNext = false, complete = true) {
  const events: unknown[][] = []
  const rows = Array.from({ length: shown }, (_, index) => h('li', `file${offset + index}`))
  const mounted = await mountApp(
    defineComponent(
      () => () =>
        h(
          PagedList,
          {
            total,
            offset,
            shown,
            complete,
            hasNext,
            hasPrev: offset > 0,
            filter: '',
            onNext: () => events.push(['next']),
            onPrev: () => events.push(['prev']),
            onFilter: (value: string) => events.push(['filter', value]),
          },
          { default: () => rows },
        ),
    ),
  )
  if (mounted.errors.length) throw mounted.errors[0]
  return { ...mounted, events }
}

describe('PagedList', () => {
  it('shows the wait on the page button that was used until its page is read', async () => {
    const busy = ref(false)
    const props = { total: 250, offset: 100, shown: 0, hasNext: true, hasPrev: true, filter: '' }
    const { root } = await mountApp(
      defineComponent(() => () => h(PagedList, { ...props, busy: busy.value, onNext: () => (busy.value = true) })),
    )
    await click(button(root, 'Next'))
    const next = button(root, 'Loading the page Next')
    expect(next.props['aria-busy']).toBe(true)
    expect(next.props.disabled).toBe(true)
    expect(button(root, 'Previous').props['aria-busy']).toBe(false)
    busy.value = false
    await flush()
    expect(content(root)).not.toContain('Loading the page')
    // A read the list did not ask for marks no button.
    busy.value = true
    await flush()
    expect(content(root)).not.toContain('Loading the page')
  })

  it('shows the range and asks for the next and previous page', async () => {
    const { root, events } = await mount(100, 100, 250, true)
    expect(content(root)).toContain('101-200 of 250')
    await click(button(root, 'Next'))
    await click(button(root, 'Previous'))
    expect(events).toEqual([['next'], ['prev']])
  })

  it('calls a lower bound at least', async () => {
    const { root } = await mount(0, 100, 1000, true, false)
    expect(content(root)).toContain('1-100 of at least 1,000')
  })

  it('stops at both ends', async () => {
    const first = await mount(0, 100, 100)
    expect(button(first.root, 'Previous').props.disabled).toBe(true)
    expect(button(first.root, 'Next').props.disabled).toBe(true)
    const empty = await mount(0, 0, 0)
    expect(content(empty.root)).toContain('No files')
  })

  it('keeps Next on an empty page that has more after it', async () => {
    const { root, events } = await mount(100, 0, 300, true, false)
    expect(content(root)).toContain('None on this page.')
    expect(content(root)).not.toContain('No files')
    await click(button(root, 'Next'))
    expect(events).toEqual([['next']])
  })

  it('sends the filter text when it changes', async () => {
    const { root, events } = await mount(0, 3, 3)
    const field = element(root, (node) => node.tag === 'input')
    field.value = ' faa '
    ;(field.props.onInput as (event: unknown) => void)({ target: field })
    await flush()
    ;(field.props.onChange as () => void)()
    expect(events).toEqual([['filter', 'faa']])
  })
})
