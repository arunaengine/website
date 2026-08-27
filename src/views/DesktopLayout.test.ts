import { createSSRApp, defineComponent, h, ref, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const route = { path: '/app', hash: '' }
const permissions = {
  isRealmAdmin: ref(false),
  canInspectUsers: ref(false),
  canManageOnboarding: ref(false),
  canManageQuarantine: ref(false),
  isManagementNode: ref(false),
}
const probeRealm = vi.fn(async () => undefined)
const watchNode = vi.fn()
const realmReach = ref('reachable')

const RouterLinkStub = defineComponent({
  props: { to: { type: [String, Object], required: true } },
  setup(props, { slots }) {
    return () => h('a', { href: typeof props.to === 'string' ? props.to : '#' }, slots.default?.())
  },
})
const EmptyStub = defineComponent(() => () => null)
// Records the variant it was handed, which is how the desktop chrome is chosen.
const TopBarStub = defineComponent({
  props: { variant: { type: String, default: 'portal' } },
  setup: (props) => () => h('div', `topbar:${props.variant}`),
})

let DesktopLayout: Component

beforeAll(async () => {
  vi.doMock('vue-router', () => ({
    RouterLink: RouterLinkStub,
    RouterView: EmptyStub,
    useRoute: () => route,
  }))
  vi.doMock('@/composables/useAruna', () => ({ useAruna: () => permissions }))
  vi.doMock('@/composables/useDeviceStatus', () => ({ useDeviceStatus: () => ({ start: watchNode }) }))
  vi.doMock('@/lib/config', () => ({ featureEnabled: () => true }))
  vi.doMock('@/lib/desktopBoot', () => ({ probeRealm, realmReach }))
  vi.doMock('@/components/dashboard/TopBar.vue', () => ({ default: TopBarStub }))
  vi.doMock('@/components/layout/AppLogo.vue', () => ({ default: EmptyStub }))
  vi.doMock('@/components/layout/GlobalErrorBanner.vue', () => ({ default: EmptyStub }))
  vi.doMock('@/components/layout/RealmUnreachable.vue', () => ({ default: EmptyStub }))
  vi.doMock('@/components/data/TransfersPanel.vue', () => ({ default: EmptyStub }))
  DesktopLayout = (await import('./DesktopLayout.vue')).default
})

beforeEach(() => {
  for (const permission of Object.values(permissions)) permission.value = false
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
      '/app/search',
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

  it('adds the admin destinations a realm admin may reach', async () => {
    permissions.isRealmAdmin.value = true
    permissions.canManageQuarantine.value = true

    const html = await renderToString(createSSRApp(DesktopLayout))

    expect(destinations(html)).toEqual(expect.arrayContaining(['/app/admin', '/app/admin/quarantine']))
    expect(html.match(/role="separator"/g)).toHaveLength(3)
    expect(html).toContain('Admin')
  })

  it('carries one navigation and no mobile bar', async () => {
    // The bottom bar belongs to the browser portal; the shell is one window,
    // and it renders the More sheet that would come with it.
    const html = await renderToString(createSSRApp(DesktopLayout))

    expect(html.match(/<nav/g)).toHaveLength(1)
    expect(html).not.toContain('More')
    expect(html).not.toContain('md:hidden')
  })
})
