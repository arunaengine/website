import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as PermissionPaths from './permission-paths'
import * as Utils from '@/lib/utils'
import { button, click, compileClientComponent, content, element, mountApp, moduleDefault, nodes, typeValue } from '@/test/clientRender'

const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const ButtonStub = defineComponent({
  inheritAttrs: false,
  props: { variant: String, size: String, disabled: Boolean },
  setup: (props, { attrs, slots }) => () => h('button', { ...attrs, disabled: props.disabled }, slots.default?.()),
})
const InputStub = defineComponent({
  props: { modelValue: String },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () =>
    h('input', { value: props.modelValue, onInput: (e: { target: { value: string } }) => emit('update:modelValue', e.target.value) }),
})
// Options render as buttons so a test can pick a level or a holder by label.
const ChoiceStub = defineComponent({
  props: { modelValue: String, options: { type: Array, default: () => [] }, ariaLabel: String },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () =>
    h(
      'div',
      { 'data-choice': props.ariaLabel, 'data-value': props.modelValue },
      (props.options as Array<{ value: string; label: string }>).map((option) =>
        h('button', { 'data-option': option.value, onClick: () => emit('update:modelValue', option.value) }, option.label),
      ),
    ),
})
const PickerStub = defineComponent({
  emits: ['select'],
  setup: (_, { emit }) => () => h('button', { onClick: () => emit('select', ['data/**']) }, 'pick data'),
})

const createGroupRole = vi.fn().mockResolvedValue({})
const deleteGroupRole = vi.fn().mockResolvedValue(undefined)

const builder = compileClientComponent(new URL('./RoleBuilder.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/OptionToggle.vue': moduleDefault(ChoiceStub),
  '@/components/ui/Select.vue': moduleDefault(ChoiceStub),
  './PermissionPathPicker.vue': moduleDefault(PickerStub),
  './permission-paths': PermissionPaths,
  '@/composables/useAruna': { useAruna: () => ({ createGroupRole, deleteGroupRole, saving: ref(false) }) },
  '@/lib/utils': Utils,
})

const group = { display_name: 'Reef lab', group_id: 'g-1', realm_id: 'realm-1', roles: [] }

async function render(role: Record<string, unknown> | null = null, props: Record<string, unknown> = {}) {
  const saved = vi.fn()
  const host = defineComponent({ setup: () => () => h(builder, { group, role, onSaved: saved, ...props }) })
  const { root, errors } = await mountApp(host)
  expect(errors).toEqual([])
  return { root, saved }
}

function choice(root: ReturnType<typeof nodes>[number], label: string) {
  return element(root, (node) => node.props['data-choice'] === label)
}

function optionLabels(node: ReturnType<typeof nodes>[number]): string[] {
  return nodes(node).filter((child) => child.props['data-option']).map((child) => content(child))
}

function levelValues(root: ReturnType<typeof nodes>[number]): string[] {
  return nodes(root)
    .filter((node) => node.props['data-choice'] === 'Access level')
    .map((node) => String(node.props['data-value']))
}

async function typeName(root: ReturnType<typeof nodes>[number], value: string) {
  await typeValue(element(root, (node) => node.tag === 'input'), value)
}

describe('role builder public roles', () => {
  it('keeps a public role to the view level and sends the flag', async () => {
    createGroupRole.mockClear()
    const { root, saved } = await render()
    await typeName(root, 'public')
    await click(button(root, 'pick data'))
    await click(button(root, 'Add access rule'))

    expect(optionLabels(choice(root, 'Access level'))).toEqual(['view', 'view & edit', 'block'])
    expect(content(root)).toContain('Members with this role can')

    await click(element(root, (node) => node.props['data-option'] === 'everyone'))

    expect(content(root)).toContain('Everyone, including anonymous visitors, can')
    expect(content(root)).toContain('A public role can only view.')
    expect(optionLabels(choice(root, 'Access level'))).toEqual(['view'])

    await click(button(root, 'Create role'))

    expect(createGroupRole).toHaveBeenCalledWith('g-1', {
      name: 'public',
      permissions: { '/realm-1/g/g-1/data/**': 'read' },
      public: true,
    })
    expect(saved).toHaveBeenCalledTimes(1)
  })

  it('forces existing edit rules back to view when the role goes public', async () => {
    createGroupRole.mockClear()
    const { root } = await render()
    await typeName(root, 'curators')
    await click(button(root, 'pick data'))
    const levels = nodes(root).filter((node) => node.props['data-choice'] === 'Access level')
    await click(element(levels[0]!, (node) => node.props['data-option'] === 'write'))
    await click(button(root, 'Add access rule'))
    expect(levelValues(root)).toEqual(['write'])

    await click(element(root, (node) => node.props['data-option'] === 'everyone'))

    expect(levelValues(root)).toEqual(['read'])
    await click(button(root, 'Create role'))
    expect(createGroupRole.mock.calls[0][1].permissions).toEqual({ '/realm-1/g/g-1/data/**': 'read' })
  })

  it('recreates an edited public role with the flag kept', async () => {
    createGroupRole.mockClear()
    const { root } = await render({
      role_id: 'r-1',
      name: 'public',
      permissions: { '/realm-1/g/g-1/data/**': 'READ' },
      assigned_users: [],
      public: true,
    })

    expect(choice(root, 'Who holds this role').props['data-value']).toBe('everyone')
    await click(button(root, 'Save changes'))

    expect(createGroupRole).toHaveBeenCalledWith('g-1', {
      name: 'public',
      permissions: { '/realm-1/g/g-1/data/**': 'read' },
      assigned_users: [],
      public: true,
    })
    expect(deleteGroupRole).toHaveBeenCalledWith('g-1', 'r-1')
  })

  it('starts public with the public name when asked', async () => {
    const { root } = await render(null, { initialPublic: true })

    expect(content(root)).toContain('New public role')
    expect(choice(root, 'Who holds this role').props['data-value']).toBe('everyone')
    expect(element(root, (node) => node.tag === 'input').props.value).toBe('public')
  })
})
