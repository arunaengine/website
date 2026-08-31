import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import * as RouterRuntime from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as NodeDisplay from '@/components/nodes/node-display'
import * as Utils from '@/lib/utils'
import { button, click, compileClientComponent, content, element, moduleDefault, mountApp, nodes } from '@/test/clientRender'

const push = vi.fn()
const signOut = vi.fn(async () => undefined)
const currentUser = ref<Record<string, unknown> | null>({ id: 'u1', name: 'Test User', email: 'me@example.org' })
const nodeLabel = ref('online')
const nodeState = ref('running')
const watchNode = vi.fn()
const stopNode = vi.fn()
const assistantAvailable = ref(false)
const openAssistant = vi.fn()
const ensureProviders = vi.fn()

const Passthrough = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const Marker = (text: string) => defineComponent(() => () => h('div', text))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const StatusDotStub = defineComponent({
  props: { tone: String, label: String },
  setup: (props) => () => h('span', { 'aria-label': props.label }),
})
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })

const TopBar = compileClientComponent(new URL('./TopBar.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': {
    ...RouterRuntime,
    RouterLink: defineComponent((_, { slots }) => () => h('a', slots.default?.())),
    useRoute: () => ({ fullPath: '/app' }),
    useRouter: () => ({ push }),
  },
  '@lucide/vue': icons,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Avatar.vue': moduleDefault(Passthrough),
  '@/components/ui/Skeleton.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenu.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuTrigger.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuContent.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuItem.vue': moduleDefault(ButtonStub),
  '@/components/ui/DropdownMenuLabel.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuSeparator.vue': moduleDefault(Passthrough),
  '@/components/layout/ContextSwitcher.vue': moduleDefault(Marker('context switcher')),
  '@/components/dashboard/NotificationBell.vue': moduleDefault(Marker('bell')),
  '@/components/dashboard/SearchOverlay.vue': moduleDefault(Marker('datasets')),
  '@/components/ui/StatusDot.vue': moduleDefault(StatusDotStub),
  '@/components/nodes/node-display': NodeDisplay,
  '@/composables/useRealm': { useRealm: () => ({ realm: ref({ shortName: 'Testrealm' }), role: ref('realm-member') }) },
  '@/composables/useTheme': { useTheme: () => ({ isDark: ref(false), toggleTheme: vi.fn() }) },
  '@/composables/useAruna': {
    useAruna: () => ({ currentUser, authError: ref(null), loading: ref(false) }),
  },
  '@/composables/useAuth': {
    useAuth: () => ({
      hasSession: ref(true),
      signIn: vi.fn(),
      signOut,
      stage: ref('authenticated'),
      authPending: ref(false),
    }),
  },
  '@/composables/useDeviceStatus': {
    useDeviceStatus: () => ({ label: nodeLabel, state: nodeState, start: watchNode, stop: stopNode }),
  },
  '@/composables/useAssistantChat': {
    useAssistantChat: () => ({
      available: assistantAvailable,
      openPanel: openAssistant,
      ensureProviders,
    }),
  },
  '@/composables/assistantState': { assistantAvailable },
  '@/lib/utils': Utils,
})

beforeEach(() => {
  push.mockClear()
  signOut.mockClear()
  watchNode.mockClear()
  currentUser.value = { id: 'u1', name: 'Test User', email: 'me@example.org' }
  assistantAvailable.value = false
  openAssistant.mockClear()
})

function launcher(root: Parameters<typeof content>[0]) {
  return element(root, (node) => node.props['aria-label'] === 'Open the assistant')
}

describe('portal chrome', () => {
  it('keeps the context switcher and the dataset shortcut', async () => {
    const mounted = await mountApp(TopBar)
    const html = content(mounted.root)

    expect(html).toContain('context switcher')
    expect(html).toContain('Create dataset')
    expect(html).toContain('datasets')
    expect(watchNode).not.toHaveBeenCalled()
    await click(button(mounted.root, 'Create dataset'))
    expect(push).toHaveBeenCalledWith({ name: 'dataset-new' })
    mounted.app.unmount()
  })

  it('carries the tour anchors of its own controls', async () => {
    // The search anchor belongs to SearchOverlay, which is stubbed here.
    const mounted = await mountApp(TopBar)
    const anchors = nodes(mounted.root).map((node) => node.props['data-tour'])

    expect(anchors).toContain('top-create-dataset')
    expect(anchors).toContain('top-account')
    mounted.app.unmount()
  })

  it('offers the assistant only once a provider is ready', async () => {
    const without = await mountApp(TopBar)
    expect(() => launcher(without.root)).toThrow()
    without.app.unmount()

    assistantAvailable.value = true
    const mounted = await mountApp(TopBar)
    await click(launcher(mounted.root))

    expect(openAssistant).toHaveBeenCalledOnce()
    mounted.app.unmount()
  })

  it('sends a sign-out back to the landing page', async () => {
    const mounted = await mountApp(TopBar)

    await click(button(mounted.root, 'Sign out'))

    expect(signOut).toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith({ name: 'landing' })
    mounted.app.unmount()
  })
})

describe('desktop chrome', () => {
  it('replaces the switcher with this device and its realm', async () => {
    const mounted = await mountApp(TopBar, { props: { variant: 'desktop' } })
    const html = content(mounted.root)

    expect(html).not.toContain('context switcher')
    expect(html).not.toContain('Create dataset')
    expect(html).toContain('online')
    expect(html).toContain('Testrealm')
    expect(html).toContain('datasets')
    expect(html).toContain('bell')
    expect(watchNode).toHaveBeenCalled()
    mounted.app.unmount()
  })

  it('follows the node state it is given', async () => {
    nodeLabel.value = 'stopped'
    nodeState.value = 'stopped'

    const mounted = await mountApp(TopBar, { props: { variant: 'desktop' } })

    expect(content(mounted.root)).toContain('stopped')
    mounted.app.unmount()
    nodeLabel.value = 'online'
    nodeState.value = 'running'
  })

  it('sends a sign-out back to the shell sign-in step', async () => {
    const mounted = await mountApp(TopBar, { props: { variant: 'desktop' } })

    await click(button(mounted.root, 'Sign out'))

    expect(signOut).toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith({ name: 'welcome-sign-in' })
    mounted.app.unmount()
  })
})
