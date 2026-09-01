import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  moduleDefault,
  mountApp,
  typeValue,
} from '@/test/clientRender'
import * as Api from '@/lib/api'
import * as Utils from '@/lib/utils'

const updateGroup = vi.fn(async (_id: string, input: { display_name: string }) => ({
  display_name: input.display_name,
  group_id: 'g1',
  realm_id: 'realm-1',
  roles: [],
}))

const Passthrough = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const InputStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h('input', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    }),
})
const Empty = defineComponent(() => () => null)
const icons = new Proxy({}, { get: () => Empty })

const RenameGroupDialog = compileClientComponent(new URL('./RenameGroupDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': icons,
  '@/lib/api': Api,
  '@/lib/utils': Utils,
  '@/composables/useAruna': { useAruna: () => ({ updateGroup, saving: ref(false) }) },
  '@/components/ui/Dialog.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogContent.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogHeader.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogTitle.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogDescription.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogFooter.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogClose.vue': moduleDefault(Passthrough),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(Passthrough),
  '@/components/ui/Spinner.vue': moduleDefault(Empty),
})

async function mount() {
  return mountApp(RenameGroupDialog, { props: { open: true, groupId: 'g1', name: 'Genomics lab' } })
}

describe('Rename group dialog', () => {
  beforeEach(() => {
    updateGroup.mockClear()
  })

  it('says the id and the permissions stay', async () => {
    const { root } = await mount()
    expect(content(root)).toContain(
      'Only the name changes. The group id and every permission, bucket and dataset stay as they are.',
    )
  })

  it('sends the trimmed name and closes', async () => {
    const { root } = await mount()

    await typeValue(element(root, (node) => node.tag === 'input'), '  Genomics lab 2  ')
    await click(button(root, 'Save'))

    expect(updateGroup).toHaveBeenCalledWith('g1', { display_name: 'Genomics lab 2' })
  })

  it('refuses an empty or over-long name with the reason on screen', async () => {
    const { root } = await mount()
    const field = element(root, (node) => node.tag === 'input')

    await typeValue(field, '   ')
    expect(content(root)).toContain('A group needs a name of at least one character.')
    expect(button(root, 'Save').props.disabled).toBe(true)

    await typeValue(field, 'g'.repeat(257))
    expect(content(root)).toContain('A group name may be at most 256 characters.')
    expect(button(root, 'Save').props.disabled).toBe(true)

    await click(button(root, 'Save'))
    expect(updateGroup).not.toHaveBeenCalled()
  })

  it('explains a node without the rename route', async () => {
    updateGroup.mockRejectedValueOnce(new Api.ApiError(404, 'Not Found'))
    const { root } = await mount()

    await typeValue(element(root, (node) => node.tag === 'input'), 'Genomics lab 2')
    await click(button(root, 'Save'))

    expect(content(root)).toContain('This node does not support renaming a group yet.')
  })
})
