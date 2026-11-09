import { createSSRApp, defineComponent, h, ref, type Component } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { applyPortalConfig } from '@/lib/config'

const route = { path: '/app', params: {} as Record<string, string>, query: {} }
const RouterLinkStub = defineComponent({
  props: { to: { type: [String, Object], required: true } },
  setup(props, { slots }) {
    return () => h('a', { href: typeof props.to === 'string' ? props.to : '#' }, slots.default?.())
  },
})
const PassthroughStub = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const EmptyStub = defineComponent(() => () => null)
// Renders the trigger and the menu at once, so the menu's links can be read.
const PopoverStub = defineComponent((_, { slots }) => () => h('div', [slots.default?.(), slots.content?.()]))
const PageHeaderStub = defineComponent({
  props: { title: { type: String, required: true } },
  setup: (props) => () => h('h1', props.title),
})

const LEGAL = [
  { label: 'Imprint', url: 'https://uni.example.org/imprint' },
  { label: 'Terms of service', markdown: '# Terms\n\n<script>alert(1)</script> Use it **well**.' },
]

let SideNav: Component
let MobileNav: Component
let SiteFooter: Component
let LandingFooter: Component
let LegalView: Component

beforeAll(async () => {
  vi.doMock('vue-router', () => ({ RouterLink: RouterLinkStub, useRoute: () => route }))
  vi.doMock('@/composables/useAruna', () => ({
    useAruna: () => ({ currentUser: ref({ id: 'u1' }), isRealmAdmin: ref(false), canInspectUsers: ref(false) }),
  }))
  vi.doMock('@/composables/usePortalFeatures', () => ({ usePortalFeatures: () => ({ shown: () => true }) }))
  vi.doMock('@/components/layout/AppLogo.vue', () => ({ default: EmptyStub }))
  vi.doMock('@/components/dashboard/PageHeader.vue', () => ({ default: PageHeaderStub }))
  vi.doMock('@/components/ui/Popover.vue', () => ({ default: PopoverStub }))
  for (const ui of ['Sheet', 'SheetContent', 'DialogTitle', 'DialogDescription']) {
    vi.doMock(`@/components/ui/${ui}.vue`, () => ({ default: PassthroughStub }))
  }
  SideNav = (await import('./SideNav.vue')).default
  MobileNav = (await import('@/components/dashboard/MobileNav.vue')).default
  SiteFooter = (await import('@/components/landing/SiteFooter.vue')).default
  LandingFooter = (await import('@/components/landing/LandingFooter.vue')).default
  LegalView = (await import('@/views/LegalView.vue')).default
})

afterEach(() => {
  vi.unstubAllGlobals()
  applyPortalConfig({})
})

async function render(component: Component): Promise<string> {
  return renderToString(createSSRApp(component))
}

function legalNav(html: string): string {
  return html.match(/<nav[^>]*aria-label="Legal"[^>]*>(.*?)<\/nav>/s)?.[1] ?? ''
}

describe('legal links', () => {
  it('opens the documents as plain blue links from a Legal row under Collapse', async () => {
    applyPortalConfig({ legal: LEGAL })
    const html = await render(SideNav)
    const links = legalNav(html)

    expect(html).toMatch(/<span>Collapse<\/span><\/button>.*<button[^>]*>.*<span>Legal<\/span><\/button>/s)
    expect(links).toMatch(/<a href="https:\/\/uni\.example\.org\/imprint" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">Imprint<\/a>/)
    expect(links).toMatch(/<a href="\/legal\/1"[^>]*class="text-primary hover:underline">Terms of service<\/a>/)
    expect(links).not.toContain('<svg')
  })

  it('keeps the Legal row as an icon in the collapsed sidebar', async () => {
    applyPortalConfig({ legal: LEGAL })
    vi.stubGlobal('window', { localStorage: { getItem: () => '1', setItem: () => {} } })
    const html = await render(SideNav)

    expect(html).toMatch(/<button[^>]*title="Legal" aria-label="Legal"/)
    expect(html).not.toContain('<span>Legal</span>')
  })

  it('has no back link in portal-only mode', async () => {
    applyPortalConfig({ landing: false })
    expect(await render(SideNav)).not.toContain('Back to landing')
  })

  it('leaves the More sheet to the line at the end of the page', async () => {
    applyPortalConfig({ legal: LEGAL })
    expect(await render(MobileNav)).not.toMatch(/Legal|Imprint|\/legal\//)
  })

  it('lists the same documents in both landing footers', async () => {
    applyPortalConfig({ legal: LEGAL })

    for (const component of [SiteFooter, LandingFooter]) {
      const html = await render(component)
      expect(html).toMatch(/href="https:\/\/uni\.example\.org\/imprint"[^>]*>Imprint<\/a>/)
      expect(html).toMatch(/href="\/legal\/1"[^>]*>Terms of service<\/a>/)
    }
  })

  it('shows no legal links anywhere without config', async () => {
    for (const component of [SideNav, MobileNav, SiteFooter, LandingFooter]) {
      const html = await render(component)
      expect(html).not.toMatch(/Legal|Imprint|Terms|\/legal\//)
    }
  })
})

describe('legal document page', () => {
  it('renders the Markdown with raw HTML escaped', async () => {
    applyPortalConfig({ legal: LEGAL })
    route.params = { n: '1' }
    const html = await render(LegalView)

    expect(html).toMatch(/<h1[^>]*>Terms of service<\/h1>/)
    expect(html).toContain('<strong>well</strong>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })

  it('shows not found for a link entry or a missing document', async () => {
    applyPortalConfig({ legal: LEGAL })
    for (const n of ['0', '2', 'x']) {
      route.params = { n }
      expect(await render(LegalView)).toContain('Page not found')
    }
  })
})
