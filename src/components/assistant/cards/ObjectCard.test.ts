import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'
import ObjectCard from './ObjectCard.vue'
import type { ObjectView } from '@/lib/assistant/types'

const Stub = { render: () => null }

async function render(view: ObjectView): Promise<string> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/buckets/:bucketId', name: 'bucket', component: Stub },
      { path: '/:rest(.*)', component: Stub },
    ],
  })
  const app = createSSRApp({ render: () => h(ObjectCard, { view }) })
  app.use(router)
  await router.push('/')
  await router.isReady()
  return renderToString(app)
}

const stored: ObjectView = {
  kind: 'object',
  bucket: 'test',
  key: 'notes/hello.txt',
  caption: 'Written to the bucket',
  size: 24,
  contentType: 'text/plain; charset=utf-8',
  versionId: '01M1NXGE23RMY4RFBRBYTQDWDS',
  lastModified: new Date(Date.now() - 60_000).toISOString(),
}

describe('ObjectCard', () => {
  it('shows the facts as a card and links the data browser', async () => {
    const markup = await render(stored)

    expect(markup).toContain('hello.txt')
    expect(markup).toContain('Written to the bucket')
    expect(markup).toContain('24 B')
    expect(markup).toContain('text/plain; charset=utf-8')
    expect(markup).toContain('1m ago')
    expect(markup).toContain('href="/app/buckets/test?prefix=notes&amp;object=notes%2Fhello.txt"')
  })

  it('offers the file viewer and the bucket as their own controls', async () => {
    const markup = await render(stored)

    expect(markup).toContain('title="Open the file viewer"')
    expect(markup).toContain('href="/app/buckets/test" data-bucket="test"')
  })

  it('shortens the version and keeps it whole', async () => {
    const markup = await render(stored)

    expect(markup).toContain('01M1NXGE…QDWDS')
    expect(markup).toContain('title="01M1NXGE23RMY4RFBRBYTQDWDS"')
  })

  it('leaves out every fact it was not given', async () => {
    const markup = await render({ kind: 'object', bucket: 'test', key: 'raw/reads.fastq' })

    expect(markup).toContain('raw/reads.fastq')
    expect(markup).not.toContain('Size')
    expect(markup).not.toContain('Version')
    expect(markup).not.toContain('Node')
  })
})
