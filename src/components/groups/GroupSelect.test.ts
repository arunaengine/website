import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import * as RouterRuntime from 'vue-router'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import {
  click,
  compileClientComponent,
  content,
  element,
  moduleDefault,
  mountApp,
} from '@/test/clientRender'
import * as Utils from '@/lib/utils'

const SelectStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  setup: (props, { attrs }) => () => h('select', { ...attrs, value: props.modelValue }),
})
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const RouteStub = defineComponent(() => () => h('div'))

const GroupSelect = compileClientComponent(new URL('./GroupSelect.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': RouterRuntime,
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/lib/utils': Utils,
})

async function mount(props: Record<string, unknown>) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app', name: 'dashboard', component: RouteStub },
      { path: '/app/groups', name: 'groups', component: RouteStub },
    ],
  })
  await router.push('/app')
  await router.isReady()
  return mountApp(GroupSelect, { router, props })
}

describe('group select', () => {
  it('renders the control when groups exist', async () => {
    const { root } = await mount({ modelValue: 'g1', options: [{ value: 'g1', label: 'Group one' }] })

    expect(element(root, (node) => node.tag === 'select').props.value).toBe('g1')
    expect(content(root)).not.toContain('No groups yet.')
  })

  it('points at group creation when empty', async () => {
    const { root } = await mount({ options: [] })

    expect(content(root)).toContain('No groups yet.')
    const link = element(root, (node) => node.tag === 'a')
    expect(link.props.href).toBe('/app/groups')
    expect(content(link).trim()).toBe('Create one under Groups')
  })

  it('reports the jump so a host can close', async () => {
    const navigate = vi.fn()
    const { root } = await mount({ options: [], onNavigate: navigate })

    await click(element(root, (node) => node.tag === 'a'))

    expect(navigate).toHaveBeenCalledTimes(1)
  })
})
