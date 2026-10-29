import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { ApiError, apiErrorMessage } from '@/lib/api'
import { button, click, compileClientComponent, content, element, flush, moduleDefault, mountApp } from '@/test/clientRender'

const ButtonStub = defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()) })
const IconStub = defineComponent({ props: { label: String }, emits: ['click'], setup: (props, { emit }) => () => h('button', { 'aria-label': props.label, onClick: () => emit('click') }) })
const InputStub = defineComponent({
  props: { modelValue: String },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () => h('input', { ...attrs, value: props.modelValue, 'onUpdate:modelValue': (value: string) => emit('update:modelValue', value) }),
})

const NodeNameEdit = compileClientComponent(new URL('./NodeNameEdit.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/IconButton.vue': moduleDefault(IconStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/lib/api': { apiErrorMessage },
  '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => null) }),
})

async function open(save: (name: string | null) => Promise<void>, value: string | null = 'Giessen storage') {
  const mounted = await mountApp(NodeNameEdit, { props: { name: 'Giessen storage', value, save } })
  await click(element(mounted.root, (node) => node.props['aria-label'] === 'Rename Giessen storage'))
  const input = element(mounted.root, (node) => node.tag === 'input')
  const type = async (text: string) => {
    ;(input.props['onUpdate:modelValue'] as (value: string) => void)(text)
    await flush()
  }
  const submit = async () => {
    ;(element(mounted.root, (node) => node.tag === 'form').props.onSubmit as (event: Event) => void)({ preventDefault: () => {} } as Event)
    await flush()
  }
  return { mounted, input, type, submit }
}

describe('renaming a node', () => {
  it('starts from the stored name and saves the trimmed new one', async () => {
    const save = vi.fn(async () => undefined)
    const { mounted, input, type, submit } = await open(save)
    expect(input.props.value).toBe('Giessen storage')

    await type('  Giessen storage 1 ')
    await submit()
    expect(save).toHaveBeenCalledWith('Giessen storage 1')
    expect(() => element(mounted.root, (node) => node.tag === 'form')).toThrow()
    mounted.app.unmount()
  })

  it('resets the name when the field is left empty', async () => {
    const save = vi.fn(async () => undefined)
    const { mounted, type, submit } = await open(save)
    await type('   ')
    await submit()
    expect(save).toHaveBeenCalledWith(null)
    mounted.app.unmount()
  })

  it('shows a refusal plainly and keeps the field open, and Cancel closes it unsaved', async () => {
    const save = vi.fn(async () => {
      throw new ApiError(403, 'Caller is not a realm config admin')
    })
    const { mounted, type, submit } = await open(save)
    await type('Mine')
    await submit()
    expect(content(mounted.root)).toContain('Caller is not a realm config admin')
    expect(element(mounted.root, (node) => node.tag === 'form')).toBeTruthy()

    await click(button(mounted.root, 'Cancel'))
    expect(() => element(mounted.root, (node) => node.tag === 'form')).toThrow()
    expect(save).toHaveBeenCalledOnce()
    mounted.app.unmount()
  })
})
