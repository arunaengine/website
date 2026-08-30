import * as VueRuntime from 'vue'
import { computed, defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Utils from '@/lib/utils'
import { click, compileClientComponent, content, element, moduleDefault, mountApp } from '@/test/clientRender'

const currentUser = ref<Record<string, unknown> | null>({ id: 'u-1' })
const myGroups = ref([
  { id: 'group-a', name: 'Water quality' },
  { id: 'group-b', name: 'Soil archive' },
])
const active = ref('group-a')
const setActiveGroup = vi.fn((id: string) => {
  active.value = id
})

const Passthrough = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const CopyStub = defineComponent({
  props: { value: { type: String, default: '' }, label: { type: String, default: '' } },
  setup: (props) => () => h('button', { 'aria-label': props.label, 'data-value': props.value }),
})
const RouterLinkStub = defineComponent({
  props: { to: { type: [String, Object], default: '' } },
  setup: (props, { slots }) => () => h('a', { 'data-to': JSON.stringify(props.to) }, slots.default?.()),
})
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })

const GroupSwitcher = compileClientComponent(new URL('./GroupSwitcher.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: RouterLinkStub },
  '@lucide/vue': icons,
  '@/components/ui/DropdownMenu.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuTrigger.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuContent.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuItem.vue': moduleDefault(ButtonStub),
  '@/components/ui/DropdownMenuLabel.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuSeparator.vue': moduleDefault(Passthrough),
  '@/components/ui/CopyButton.vue': moduleDefault(CopyStub),
  '@/composables/useAruna': { useAruna: () => ({ currentUser, myGroups }) },
  '@/composables/useGroupSelection': {
    activeGroupId: computed(() => active.value),
    setActiveGroup,
  },
  '@/lib/utils': Utils,
})

beforeEach(() => {
  currentUser.value = { id: 'u-1' }
  myGroups.value = [
    { id: 'group-a', name: 'Water quality' },
    { id: 'group-b', name: 'Soil archive' },
  ]
  active.value = 'group-a'
  setActiveGroup.mockClear()
})

describe('GroupSwitcher', () => {
  it('names the active group and switches to another', async () => {
    const { root } = await mountApp(GroupSwitcher)
    expect(content(root)).toContain('Water quality')

    await click(element(root, (node) => content(node).includes('Soil archive') && node.tag === 'button'))

    expect(setActiveGroup).toHaveBeenCalledWith('group-b')
    expect(content(root)).toContain('Soil archive')
  })

  it('offers the group id and the groups page', async () => {
    const { root } = await mountApp(GroupSwitcher)

    expect(element(root, (node) => node.props['aria-label'] === 'Copy group id').props['data-value'])
      .toBe('group-a')
    expect(JSON.parse(String(element(root, (node) => node.tag === 'a').props['data-to'])))
      .toEqual({ name: 'groups' })
  })

  it('stays out of the bar without a membership', async () => {
    myGroups.value = []
    const without = await mountApp(GroupSwitcher)
    expect(content(without.root)).toBe('')
    without.app.unmount()

    myGroups.value = [{ id: 'group-a', name: 'Water quality' }]
    currentUser.value = null
    const signedOut = await mountApp(GroupSwitcher)
    expect(content(signedOut.root)).toBe('')
    signedOut.app.unmount()
  })
})
