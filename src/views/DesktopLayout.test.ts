import * as VueRuntime from 'vue'
import { createSSRApp, defineComponent, h, ref, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Nav from '@/components/layout/nav'
import * as Utils from '@/lib/utils'
import { button, click, compileClientComponent, content, moduleDefault, mountApp } from '@/test/clientRender'

const route = { name: 'dashboard', path: '/app', hash: '' }
const permissions = {
  isRealmAdmin: ref(false),
  canInspectUsers: ref(false),
  canManageOnboarding: ref(false),
  canManageQuarantine: ref(false),
  isManagementNode: ref(false),
}
const probeRealm = vi.fn(async () => undefined)
const appQuit = vi.fn(async () => undefined)
const watchNode = vi.fn()
const unwatchNode = vi.fn()
const realmReach = ref('reachable')
const nodeStatus = ref<{
  enrolled: boolean
  realmMismatch?: { expected: string; actual: string; realmUrl: string } | null
} | null>(null)
const nodeState = ref<'stopped' | 'starting' | 'running' | 'error' | 'unknown'>('unknown')
const nodeLoaded = ref(false)

const RouterLinkStub = defineComponent({
  props: { to: { type: [String, Object], required: true } },
  setup(props, { slots }) {
    return () => h('a', { href: typeof props.to === 'string' ? props.to : '#' }, slots.default?.())
  },
})
const EmptyStub = defineComponent(() => () => null)
const RouterViewStub = defineComponent(() => () => h('div', 'routed-view'))
const NodeDownStub = defineComponent(() => () => h('div', 'node-down'))
const RealmUnreachableStub = defineComponent(() => () => h('div', 'realm-unreachable'))
const SideNavStub = defineComponent((_, { slots }) => () => h('aside', slots.footer?.({ collapsed: false })))
// Records the variant it was handed, which is how the desktop chrome is chosen.
const TopBarStub = defineComponent({
  props: { variant: { type: String, default: 'portal' } },
  setup: (props) => () => h('div', `topbar:${props.variant}`),
})
const icons = new Proxy({}, { get: () => EmptyStub })
const portalConfig = () => ({
  apiBaseUrl: '/api/v1',
  authCallbackOrigin: '',
  features: {} as Record<string, boolean>,
  terminology: { gatewayUrl: 'https://terminology.example/api-gateway' },
})

const Notice = compileClientComponent(new URL('../components/ui/Notice.vue', import.meta.url), {
  vue: VueRuntime,
  '@/lib/utils': Utils,
})

const DesktopLayoutClient = compileClientComponent(new URL('./DesktopLayout.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterView: RouterViewStub, useRoute: () => route },
  '@lucide/vue': icons,
  '@/components/layout/SideNav.vue': moduleDefault(SideNavStub),
  '@/components/dashboard/TopBar.vue': moduleDefault(TopBarStub),
  '@/components/layout/GlobalErrorBanner.vue': moduleDefault(EmptyStub),
  '@/components/layout/RealmUnreachable.vue': moduleDefault(RealmUnreachableStub),
  '@/components/layout/NodeDown.vue': moduleDefault(NodeDownStub),
  '@/components/data/TransfersPanel.vue': moduleDefault(EmptyStub),
  '@/components/assistant/AssistantPanel.vue': moduleDefault(EmptyStub),
  '@/components/ui/Notice.vue': moduleDefault(Notice),
  '@/composables/useAruna': { useAruna: () => permissions },
  '@/composables/useAssistantChat': { useAssistantChat: () => ({ available: ref(false) }) },
  '@/composables/useDeviceStatus': {
    useDeviceStatus: () => ({
      status: nodeStatus,
      state: nodeState,
      loaded: nodeLoaded,
      start: watchNode,
      stop: unwatchNode,
    }),
  },
  '@/lib/config': { featureEnabled: () => true, portalConfig },
  '@/lib/desktopBridge': { appQuit },
  '@/lib/desktopBoot': { probeRealm, realmReach },
  '@/lib/utils': Utils,
  '@/components/layout/nav': Nav,
})

let DesktopLayout: Component
let AppLayout: Component

beforeAll(async () => {
  vi.doMock('vue-router', () => ({
    RouterLink: RouterLinkStub,
    RouterView: RouterViewStub,
    useRoute: () => route,
  }))
  vi.doMock('@/composables/useAruna', () => ({ useAruna: () => permissions }))
  vi.doMock('@/composables/useDeviceStatus', () => ({
    useDeviceStatus: () => ({
      status: nodeStatus,
      state: nodeState,
      loaded: nodeLoaded,
      start: watchNode,
      stop: unwatchNode,
    }),
  }))
  vi.doMock('@/lib/config', () => ({ featureEnabled: () => true, portalConfig }))
  vi.doMock('@/lib/desktopBridge', () => ({ appQuit }))
  vi.doMock('@/lib/desktopBoot', () => ({ probeRealm, realmReach }))
  vi.doMock('@/components/dashboard/TopBar.vue', () => ({ default: TopBarStub }))
  vi.doMock('@/components/dashboard/MobileNav.vue', () => ({ default: EmptyStub }))
  vi.doMock('@/components/layout/AppLogo.vue', () => ({ default: EmptyStub }))
  vi.doMock('@/components/layout/GlobalErrorBanner.vue', () => ({ default: EmptyStub }))
  vi.doMock('@/components/layout/RealmUnreachable.vue', () => ({ default: RealmUnreachableStub }))
  vi.doMock('@/components/layout/NodeDown.vue', () => ({ default: NodeDownStub }))
  vi.doMock('@/components/data/TransfersPanel.vue', () => ({ default: EmptyStub }))
  vi.doMock('@/components/assistant/AssistantPanel.vue', () => ({ default: EmptyStub }))
  DesktopLayout = (await import('./DesktopLayout.vue')).default
  AppLayout = (await import('./AppLayout.vue')).default
})

beforeEach(() => {
  for (const permission of Object.values(permissions)) permission.value = false
  route.name = 'dashboard'
  route.path = '/app'
  route.hash = ''
  realmReach.value = 'reachable'
  nodeStatus.value = null
  nodeState.value = 'unknown'
  nodeLoaded.value = false
  appQuit.mockReset().mockResolvedValue(undefined)
})

function destinations(html: string): string[] {
  return [...new Set(Array.from(html.matchAll(/href="(\/app(?:\/[^"?]*)?)/g), (match) => match[1] as string))]
}

describe('desktop shell', () => {
  it('opens with the shared block and keeps the machine behind it', async () => {
    const html = await renderToString(createSSRApp(DesktopLayout))

    expect(destinations(html)).toEqual([
      '/app',
      '/app/buckets',
      '/app/datasets',
      '/app/profiles',
      '/app/compute',
      '/app/sync',
      '/app/runs',
      '/app/device',
      '/app/groups',
      '/app/status',
      '/app/settings',
      '/app/docs/v1',
    ])
    expect(html.match(/role="separator"/g)).toHaveLength(2)
    expect(html).toContain('Sync')
    expect(html).toContain('This device')
    expect(html).toContain('Groups')
    expect(html).toContain('Status')
  })

  it('carries one flat list with no group headings', async () => {
    permissions.isRealmAdmin.value = true

    const html = await renderToString(createSSRApp(DesktopLayout))

    expect(html.match(/<ul/g)).toHaveLength(1)
    for (const heading of ['Machine', 'Realm', 'Help']) expect(html).not.toContain(heading)
  })

  it('wears the desktop chrome and no way back to a landing page', async () => {
    const html = await renderToString(createSSRApp(DesktopLayout))

    expect(html).toContain('topbar:desktop')
    expect(html).not.toContain('Back to landing')
    expect(html).toContain('Skip to content')
  })

  it('renders the quit entry only in the desktop shell', async () => {
    const desktop = await renderToString(createSSRApp(DesktopLayout))
    const portal = await renderToString(createSSRApp(AppLayout))

    expect(desktop).toContain('Quit Aruna Desktop')
    expect(portal).not.toContain('Quit Aruna Desktop')
  })

  it('asks the shell to quit and stays busy when it accepts', async () => {
    const mounted = await mountApp(DesktopLayoutClient)

    await click(button(mounted.root, 'Quit Aruna Desktop'))

    expect(appQuit).toHaveBeenCalledOnce()
    expect(content(mounted.root)).toContain('Quitting…')
    mounted.app.unmount()
  })

  it('returns the quit entry with the shell error on failure', async () => {
    appQuit.mockRejectedValueOnce(new Error('The shell refused to quit.'))
    const mounted = await mountApp(DesktopLayoutClient)

    await click(button(mounted.root, 'Quit Aruna Desktop'))

    expect(content(mounted.root)).toContain('Quit Aruna Desktop')
    expect(content(mounted.root)).toContain('The shell refused to quit.')
    mounted.app.unmount()
  })

  it('adds the admin destinations a realm admin may reach', async () => {
    permissions.isRealmAdmin.value = true
    permissions.canManageQuarantine.value = true

    const html = await renderToString(createSSRApp(DesktopLayout))

    expect(destinations(html)).toEqual(expect.arrayContaining(['/app/admin', '/app/admin/quarantine']))
    expect(html.match(/role="separator"/g)).toHaveLength(3)
    expect(html).toContain('Admin')
    expect(html).toContain('Quarantine')
  })

  it('carries one navigation and no mobile bar', async () => {
    // The bottom bar belongs to the browser portal; the shell is one window,
    // and it renders the More sheet that would come with it.
    const html = await renderToString(createSSRApp(DesktopLayout))

    expect(html.match(/<nav/g)).toHaveLength(1)
    expect(html).not.toContain('More')
    expect(html).not.toContain('md:hidden')
  })

  it.each(['stopped', 'error'] as const)('blocks routed views when an enrolled node is %s', async (state) => {
    nodeLoaded.value = true
    nodeStatus.value = { enrolled: true }
    nodeState.value = state

    const html = await renderToString(createSSRApp(DesktopLayout))

    expect(html).toContain('node-down')
    expect(html).not.toContain('routed-view')
  })

  it('blocks routed views for a stopped recreated realm', async () => {
    nodeLoaded.value = true
    nodeStatus.value = {
      enrolled: false,
      realmMismatch: {
        expected: 'old-realm',
        actual: 'new-realm',
        realmUrl: 'https://realm.example',
      },
    }
    nodeState.value = 'stopped'

    const html = await renderToString(createSSRApp(DesktopLayout))

    expect(html).toContain('node-down')
    expect(html).not.toContain('routed-view')
  })

  it('keeps routed views reachable while the node is running', async () => {
    nodeLoaded.value = true
    nodeStatus.value = { enrolled: true }
    nodeState.value = 'running'

    const html = await renderToString(createSSRApp(DesktopLayout))

    expect(html).toContain('routed-view')
    expect(html).not.toContain('node-down')
  })

  it('keeps routed views reachable before the device is enrolled', async () => {
    nodeLoaded.value = true
    nodeStatus.value = { enrolled: false }
    nodeState.value = 'stopped'

    const html = await renderToString(createSSRApp(DesktopLayout))

    expect(html).toContain('routed-view')
    expect(html).not.toContain('node-down')
  })

  it('keeps This device reachable while the enrolled node is down', async () => {
    route.name = 'device'
    route.path = '/app/device'
    nodeLoaded.value = true
    nodeStatus.value = { enrolled: true }
    nodeState.value = 'error'

    const html = await renderToString(createSSRApp(DesktopLayout))

    expect(html).toContain('routed-view')
    expect(html).not.toContain('node-down')
  })

  it('keeps the realm failure page ahead of the node failure page', async () => {
    realmReach.value = 'unreachable'
    nodeLoaded.value = true
    nodeStatus.value = { enrolled: true }
    nodeState.value = 'stopped'

    const html = await renderToString(createSSRApp(DesktopLayout))

    expect(html).toContain('realm-unreachable')
    expect(html).not.toContain('node-down')
  })
})
