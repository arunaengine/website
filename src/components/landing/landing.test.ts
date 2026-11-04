import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'
import LandingView from '@/views/LandingView.vue'
import HeroMap from './HeroMap.vue'
import PortalShowcase from './PortalShowcase.vue'

const ALLOWED = new Set([
  '/news',
  '/app',
  '/app/docs/v1',
  '/app/datasets',
  '/imprint',
  '/terms',
  'https://github.com/arunaengine/aruna',
  'https://github.com/arunaengine/aruna/issues',
  'https://github.com/arunaengine/aruna#2-run-a-small-cluster-on-your-computer',
  'https://github.com/arunaengine/aruna#3-run-a-single-node',
  'https://v3.aruna-engine.org',
  'https://v3.aruna-engine.org/app',
])

async function render(component: object): Promise<string> {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:any(.*)*', component: { render: () => null } }] })
  const app = createSSRApp({ render: () => h(component) })
  app.use(router)
  await router.push('/')
  return renderToString(app)
}

function hrefs(markup: string): string[] {
  return [...markup.matchAll(/href="([^"]*)"/g)].map((match) => match[1]!)
}

describe('landing page', () => {
  it('lists the six folders of the example bucket', async () => {
    const markup = await render(HeroMap)

    expect(markup).toContain('1 bucket, 6 folders, 6 places')
    const folders = [...markup.matchAll(/<li[^>]*>.*?<code>([^<]+)<\/code>/g)].map((match) => match[1])
    expect(folders).toEqual([
      'boston-fish/',
      'heidelberg-imaging/',
      'mumbai-archive/',
      'sandiego-variants/',
      'tokyo-sequencing/',
      'ncbi-reference/',
    ])
    // The imaging facility starts highlighted; NCBI is linked only and has no pin.
    expect(markup).toMatch(/<li class="on">.*?heidelberg-imaging\//)
    expect(markup.match(/\bw-site\b/g)).toHaveLength(5)
  })

  it('links only to the agreed routes and sites', async () => {
    const markup = await render(LandingView)
    const targets = hrefs(markup).filter((href) => !href.startsWith('#'))

    expect(targets.length).toBeGreaterThan(0)
    for (const target of targets) expect(ALLOWED, target).toContain(target)
    expect(markup).not.toContain('/welcome')
  })

  it('points every in-page anchor at a section on the page', async () => {
    const markup = await render(LandingView)
    const ids = new Set([...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]))
    const anchors = hrefs(markup).filter((href) => href.startsWith('#'))

    expect(new Set(anchors)).toEqual(new Set(['#top', '#why', '#what', '#portal', '#start']))
    for (const anchor of anchors) expect(ids, anchor).toContain(anchor.slice(1))
  })

  it('shows one of five portal views, each owned by its tab', async () => {
    const markup = await render(PortalShowcase)
    const panels = [...markup.matchAll(/<div id="(pv-[a-z0-9]+)" class="pv"( hidden)?/g)]
    const tabs = [...markup.matchAll(/aria-controls="(pv-[a-z0-9]+)" aria-selected="(true|false)"/g)]

    expect(panels.map((match) => match[1])).toEqual(['pv-ds', 'pv-s3', 'pv-nd', 'pv-sh', 'pv-rn'])
    expect(tabs.map((match) => match[1])).toEqual(panels.map((match) => match[1]))
    expect(panels.filter((match) => !match[2]).map((match) => match[1])).toEqual(['pv-ds'])
    expect(tabs.filter((match) => match[2] === 'true').map((match) => match[1])).toEqual(['pv-ds'])
  })
})
