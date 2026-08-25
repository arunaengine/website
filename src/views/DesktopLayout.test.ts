import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
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
  it('leads with the machine and keeps the realm behind it', async () => {
    const html = await renderToString(createSSRApp(DesktopLayout))

    expect(destinations(html)).toEqual([
      '/app',
      '/app/folders',
      '/app/transfers',
      '/app/runs',
      '/app/device',
      '/app/buckets',
      '/app/search',
      '/app/settings',
      '/app/docs/v1',
    ])
    expect(html).toContain('Machine')
    expect(html).toContain('Synced folders')
    expect(html).toContain('This device')
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
    expect(html).toContain('Admin')
  })

  it('carries no mobile bar and no realm switcher', () => {
    // Both belong to the browser portal; the shell is one desktop window.
    const source = readFileSync(fileURLToPath(new URL('./DesktopLayout.vue', import.meta.url)), 'utf8')
    const topBar = readFileSync(
      fileURLToPath(new URL('../components/dashboard/TopBar.vue', import.meta.url)),
      'utf8',
    )

    expect(source).not.toContain('MobileNav')
    expect(source).not.toContain('RealmSwitcher')
    expect(topBar).toContain('<RealmSwitcher v-else')
  })
})
