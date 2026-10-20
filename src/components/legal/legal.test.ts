import { createSSRApp, defineComponent, h, type Component } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const route = { query: {} as Record<string, string> }
const RouterLinkStub = defineComponent((_, { slots }) => () => h('a', slots.default?.()))

let ImprintView: Component
let TermsView: Component

beforeAll(async () => {
  vi.doMock('vue-router', () => ({ RouterLink: RouterLinkStub, useRoute: () => route }))
  vi.doMock('@/components/landing/LandingNav.vue', () => ({ default: defineComponent(() => () => h('header')) }))
  vi.doMock('@/components/landing/LandingFooter.vue', () => ({ default: defineComponent(() => () => h('footer')) }))
  ImprintView = (await import('@/views/ImprintView.vue')).default
  TermsView = (await import('@/views/TermsView.vue')).default
})

async function render(view: Component, lang?: string): Promise<string> {
  route.query = lang ? { lang } : {}
  return renderToString(createSSRApp(view))
}

describe('legal pages', () => {
  it('shows the German text unless English is chosen', async () => {
    const german = await render(ImprintView)
    const english = await render(ImprintView, 'en')

    expect(german).toContain('Datenschutzerklärung')
    expect(german).not.toContain('Privacy Policy')
    expect(english).toContain('Privacy Policy')
    expect(english).toContain('mailto:datenschutz@aruna-storage.org')
  })

  it('marks the English terms as a translation', async () => {
    expect(await render(TermsView)).toContain('Nutzungsbedingungen')
    expect(await render(TermsView, 'en')).toContain('(translation, not legally binding)')
  })
})
