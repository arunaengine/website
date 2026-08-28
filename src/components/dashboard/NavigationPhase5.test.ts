import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createSSRApp, defineComponent, h, ref, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const route = { path: '/app' }
const permissions = {
  isRealmAdmin: ref(false),
  canInspectUsers: ref(false),
  canManageOnboarding: ref(false),
  canManageQuarantine: ref(false),
  isManagementNode: ref(false),
}
const enabledFeatures = new Set(['tes', 'jobs'])

const RouterLinkStub = defineComponent({
  props: { to: { type: [String, Object], required: true } },
  setup(props, { slots }) {
    return () => h('a', { href: typeof props.to === 'string' ? props.to : '#' }, slots.default?.())
  },
})
const PassthroughStub = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const EmptyStub = defineComponent(() => () => null)

let SideNav: Component
let MobileNav: Component

beforeAll(async () => {
  vi.doMock('vue-router', () => ({
    RouterLink: RouterLinkStub,
    useRoute: () => route,
  }))
  vi.doMock('@/composables/useAruna', () => ({ useAruna: () => permissions }))
  vi.doMock('@/lib/config', () => ({ featureEnabled: (flag: string) => enabledFeatures.has(flag) }))
  vi.doMock('@/components/layout/AppLogo.vue', () => ({ default: EmptyStub }))
  vi.doMock('@/components/ui/Sheet.vue', () => ({ default: PassthroughStub }))
  vi.doMock('@/components/ui/SheetContent.vue', () => ({ default: PassthroughStub }))
  vi.doMock('@/components/ui/DialogTitle.vue', () => ({ default: PassthroughStub }))
  vi.doMock('@/components/ui/DialogDescription.vue', () => ({ default: PassthroughStub }))
  SideNav = (await import('@/components/layout/SideNav.vue')).default
  MobileNav = (await import('./MobileNav.vue')).default
})

beforeEach(() => {
  route.path = '/app'
  for (const permission of Object.values(permissions)) permission.value = false
})

async function render(component: Component): Promise<string> {
  return renderToString(createSSRApp(component))
}

function portalPaths(html: string): string[] {
  return Array.from(html.matchAll(/href="(\/app(?:\/[^"?]*)?)/g), (match) => match[1] as string)
}

function uniqueSorted(paths: string[]): string[] {
  return [...new Set(paths)].sort()
}

describe('Phase 5 navigation parity', () => {
  it('makes every desktop destination reachable on mobile with no admin permissions', async () => {
    const desktop = await render(SideNav)
    const mobile = await render(MobileNav)

    expect(uniqueSorted(portalPaths(mobile))).toEqual(uniqueSorted(portalPaths(desktop)))
    // The bar takes the primary entries in the sidebar's own order.
    expect(portalPaths(mobile).slice(0, 5)).toEqual([
      '/app',
      '/app/buckets',
      '/app/datasets',
      '/app/compute',
      '/app/groups',
    ])
    expect(mobile).toContain('More')
  })

  it('offers the sidebar destinations as one list of blocks', async () => {
    const html = await render(SideNav)

    expect(portalPaths(html)).toEqual([
      '/app',
      '/app/buckets',
      '/app/datasets',
      '/app/profiles',
      '/app/compute',
      '/app/groups',
      '/app/status',
      '/app/settings',
      '/app/docs/v1',
    ])
    expect(html.match(/<ul/g)).toHaveLength(1)
    expect(html.match(/role="separator"/g)).toHaveLength(1)
    for (const heading of ['Workspace', 'Catalog', 'Account']) expect(html).not.toContain(heading)
  })

  it('applies each permitted Admin destination identically on desktop and mobile', async () => {
    for (const permission of Object.values(permissions)) permission.value = true

    const sidebar = await render(SideNav)
    const desktopPaths = uniqueSorted(portalPaths(sidebar))
    const mobilePaths = uniqueSorted(portalPaths(await render(MobileNav)))

    expect(mobilePaths).toEqual(desktopPaths)
    // The admin block earns a separator of its own once it has entries.
    expect(sidebar.match(/role="separator"/g)).toHaveLength(2)
    expect(desktopPaths).toEqual(expect.arrayContaining([
      '/app/admin',
      '/app/admin/users',
      '/app/admin/onboarding',
    ]))
  })

  it('offers node onboarding on a node that is not a management node', async () => {
    // The onboarding routes are relayed, so the permission alone decides.
    permissions.canManageOnboarding.value = true

    for (const html of [await render(SideNav), await render(MobileNav)]) {
      expect(portalPaths(html)).toContain('/app/admin/onboarding')
    }
  })

  it('keeps quarantine in the permission-gated admin block', async () => {
    const adminSource = readFileSync(fileURLToPath(new URL('../../views/AdminView.vue', import.meta.url)), 'utf8')
    const navSource = readFileSync(fileURLToPath(new URL('../layout/nav.ts', import.meta.url)), 'utf8')

    // Without the permission the entry does not exist at all.
    for (const html of [await render(SideNav), await render(MobileNav)]) {
      expect(portalPaths(html)).not.toContain('/app/admin/quarantine')
    }
    permissions.canManageQuarantine.value = true
    for (const html of [await render(SideNav), await render(MobileNav)]) {
      expect(portalPaths(html)).toContain('/app/admin/quarantine')
    }
    expect(navSource).toContain('canManageQuarantine')
    expect(adminSource).toContain('v-if="canManageQuarantine"')
    expect(adminSource).toContain("{ name: 'admin-quarantine' }")
  })

  it('reads one compute flag expression and offers a bottom sheet with readable targets', () => {
    const navSource = readFileSync(fileURLToPath(new URL('../layout/nav.ts', import.meta.url)), 'utf8')
    const sideSource = readFileSync(
      fileURLToPath(new URL('../layout/SideNav.vue', import.meta.url)),
      'utf8',
    )
    const mobileSource = readFileSync(fileURLToPath(new URL('./MobileNav.vue', import.meta.url)), 'utf8')

    expect(navSource).toContain("featureEnabled('tes') || featureEnabled('jobs')")
    // Neither shell decides the destinations any more.
    for (const source of [sideSource, mobileSource]) {
      expect(source).toContain("from '@/components/layout/nav'")
      expect(source).not.toContain('featureEnabled')
    }
    expect(mobileSource).toContain('side="bottom"')
    expect(mobileSource).not.toContain('side="right"')
    expect(mobileSource).toContain('min-h-12')
    expect(mobileSource).toContain('<span class="text-center whitespace-nowrap">{{ item.label }}</span>')
  })
})

describe('Phase 5 route stability', () => {
  it('uses the Datasets path and redirects the old catalog paths', () => {
    const routerSource = readFileSync(
      fileURLToPath(new URL('../../router/routes.ts', import.meta.url)),
      'utf8',
    )

    expect(routerSource).toContain("{ path: 'datasets', name: 'datasets'")
    expect(routerSource).toContain("{ path: 'datasets/:id', name: 'dataset'")
    expect(routerSource).toContain("{ path: 'search', redirect: { name: 'datasets' } }")
    expect(routerSource).toContain("{ path: 'metadata', redirect: { name: 'datasets' } }")
    expect(routerSource).toContain("path: 'metadata/:id'")
    expect(routerSource).toContain("{ path: 'docs/v1/:topic?', name: 'docs'")
  })
})
