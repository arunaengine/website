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
const setRealm = vi.fn()
const realm = ref({ id: 'realm-1', name: 'Demo realm', shortName: 'Demo', color: '#336699' })
const realms = ref([
  { id: 'realm-1', name: 'Demo realm', shortName: 'Demo', color: '#336699' },
  { id: 'realm-2', name: 'Archive realm', shortName: 'Archive', color: '#993366' },
])

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

const ContextSwitcher = compileClientComponent(new URL('./ContextSwitcher.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: RouterLinkStub },
  '@lucide/vue': icons,
  '@/components/ui/DropdownMenu.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuTrigger.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuContent.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuItem.vue': moduleDefault(ButtonStub),
  '@/components/ui/DropdownMenuLabel.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuSeparator.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuSub.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuSubTrigger.vue': moduleDefault(ButtonStub),
  '@/components/ui/DropdownMenuSubContent.vue': moduleDefault(Passthrough),
  '@/components/ui/CopyButton.vue': moduleDefault(CopyStub),
  '@/composables/useAruna': { useAruna: () => ({ currentUser, myGroups }) },
  '@/composables/useRealm': {
    useRealm: () => ({
      realm,
      realmDisplayName: computed(() => realm.value.name),
      realmId: computed(() => realm.value.id),
      activeRealmId: computed(() => realm.value.id),
      accessibleRealms: realms,
      myMemberships: ref([{ userId: 'u-1', realmId: 'realm-1', role: 'realm-admin', since: '' }]),
      setRealm,
    }),
  },
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
  realm.value = { id: 'realm-1', name: 'Demo realm', shortName: 'Demo', color: '#336699' }
  setActiveGroup.mockClear()
  setRealm.mockClear()
})

describe('ContextSwitcher', () => {
  it('names the active group and switches to another', async () => {
    const { root } = await mountApp(ContextSwitcher)
    expect(content(root)).toContain('Water quality')
    expect(content(root)).toContain('Group · Demo')

    await click(element(root, (node) => content(node).includes('Soil archive') && node.tag === 'button'))

    expect(setActiveGroup).toHaveBeenCalledWith('group-b')
    expect(content(root)).toContain('Soil archive')
  })

  it('switches the realm from the submenu', async () => {
    const { root } = await mountApp(ContextSwitcher)
    expect(content(root)).toContain('Realm: Demo realm')

    await click(element(root, (node) => content(node).includes('Archive realm') && node.tag === 'button'))

    expect(setRealm).toHaveBeenCalledWith('realm-2')
    expect(element(root, (node) => node.props['aria-label'] === 'Copy realm id').props['data-value'])
      .toBe('realm-1')
  })

  it('offers the group id and the groups page', async () => {
    const { root } = await mountApp(ContextSwitcher)

    expect(element(root, (node) => node.props['aria-label'] === 'Copy group id').props['data-value'])
      .toBe('group-a')
    expect(JSON.parse(String(element(root, (node) => node.tag === 'a').props['data-to'])))
      .toEqual({ name: 'groups' })
  })

  it('hides the label on a narrow bar', async () => {
    const { root } = await mountApp(ContextSwitcher)

    const label = element(root, (node) => String(node.props.class ?? '').includes('sm:flex'))
    expect(String(label.props.class)).toContain('hidden')
    expect(content(label)).toContain('Water quality')
  })

  it('falls back to the realm without a membership', async () => {
    myGroups.value = []
    const without = await mountApp(ContextSwitcher)
    expect(content(without.root)).toContain('Active realm')
    expect(content(without.root)).toContain('Demo realm')
    expect(content(without.root)).not.toContain('Switch group')
    without.app.unmount()

    myGroups.value = [{ id: 'group-a', name: 'Water quality' }]
    currentUser.value = null
    const signedOut = await mountApp(ContextSwitcher)
    expect(content(signedOut.root)).toContain('Active realm')
    expect(content(signedOut.root)).not.toContain('Manage groups')
    signedOut.app.unmount()
  })
})
