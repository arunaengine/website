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
    expect(portalPaths(mobile).slice(0, 5)).toEqual([
      '/app',
      '/app/search',
      '/app/buckets',
      '/app/compute',
      '/app/groups',
    ])
    expect(mobile).toContain('More')
  })

  it('applies each permitted Admin destination identically on desktop and mobile', async () => {
    for (const permission of Object.values(permissions)) permission.value = true

    const desktopPaths = uniqueSorted(portalPaths(await render(SideNav)))
    const mobilePaths = uniqueSorted(portalPaths(await render(MobileNav)))

    expect(mobilePaths).toEqual(desktopPaths)
    expect(desktopPaths).toEqual(expect.arrayContaining([
      '/app/admin',
      '/app/admin/users',
      '/app/admin/onboarding',
      '/app/admin/quarantine',
    ]))
  })

  it('uses the same compute flag expression and a bottom sheet with readable targets', () => {
    const sideSource = readFileSync(
      fileURLToPath(new URL('../layout/SideNav.vue', import.meta.url)),
      'utf8',
    )
    const mobileSource = readFileSync(fileURLToPath(new URL('./MobileNav.vue', import.meta.url)), 'utf8')

    expect(sideSource).toContain('tesEnabled || jobsEnabled')
    expect(mobileSource).toContain('tesEnabled || jobsEnabled')
    expect(mobileSource).toContain('side="bottom"')
    expect(mobileSource).not.toContain('side="right"')
    expect(mobileSource).toContain('min-h-12')
    expect(mobileSource).toContain('<span class="text-center whitespace-nowrap">{{ item.label }}</span>')
  })
})

describe('Phase 5 route stability', () => {
  it('keeps the Datasets destination on the existing search and metadata paths', () => {
    const routerSource = readFileSync(
      fileURLToPath(new URL('../../router/index.ts', import.meta.url)),
      'utf8',
    )

    expect(routerSource).toContain("{ path: 'search', name: 'search'")
    expect(routerSource).toContain("{ path: 'metadata', name: 'metadata', redirect: { name: 'search' } }")
    expect(routerSource).toContain("{ path: 'metadata/:id', name: 'metadata-detail'")
    expect(routerSource).not.toMatch(/path:\s*['"]datasets(?:\/|['"])/)
    expect(routerSource).toContain("{ path: 'docs/v1/:topic?', name: 'docs'")
  })
})
