import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'
import CrateCard from './CrateCard.vue'

const Stub = { render: () => null }

async function render(props: { title: string; crate: unknown; documentId?: string }): Promise<string> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/datasets/:id', name: 'dataset', component: Stub },
      { path: '/:rest(.*)', component: Stub },
    ],
  })
  const app = createSSRApp({ render: () => h(CrateCard, props) })
  app.use(router)
  await router.push('/')
  await router.isReady()
  return renderToString(app)
}

const crate = {
  '@graph': [
    { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', about: { '@id': './' } },
    { '@id': './', '@type': 'Dataset', name: 'Pictures', description: 'Holiday pictures.', hasPart: { '@id': 'a.png' } },
    { '@id': 'a.png', '@type': 'File', name: 'a.png' },
  ],
}

describe('CrateCard', () => {
  it('offers the graph when it has the crate', async () => {
    const markup = await render({ title: 'Pictures', crate })

    expect(markup).toContain('Holiday pictures.')
    expect(markup).toContain('Show graph')
    expect(markup).toContain('aria-pressed="false"')
  })

  it('offers no graph when it only has the id', async () => {
    const markup = await render({ title: 'Pictures', crate: {}, documentId: '01M1NXGE23RMY4RFBRBYTQDWDS' })

    expect(markup).not.toContain('Show graph')
    expect(markup).toContain('Open the dataset')
  })
})
