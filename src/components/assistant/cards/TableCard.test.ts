import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it } from 'vitest'
import TableCard from './TableCard.vue'
import { setKnownBuckets } from '@/lib/knownBuckets'
import { providePageContext, usePageContext } from '@/composables/usePageContext'

const Stub = { render: () => null }

const KEYS = [
  ['preview_check.json'],
  ['preview_check.py'],
  ['.aruna/scripts/01M1NXNBGEHRPH8JFV7F40WE1M/script.py'],
  ['notes/hello.txt'],
]

interface Props {
  title: string
  columns: string[]
  rows: unknown[][]
  bucket?: string
}

async function render(props: Props, page?: string): Promise<string> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:rest(.*)', component: Stub }],
  })
  const app = createSSRApp({
    setup() {
      if (page) providePageContext(() => ({ kind: 'bucket', title: page, details: { bucket: page } }))
      return () => h(TableCard, props)
    },
  })
  app.use(router)
  await router.push('/')
  await router.isReady()
  return renderToString(app)
}

// Both are module singletons, and a server-rendered app never disposes them.
afterEach(() => {
  setKnownBuckets([])
  usePageContext().page.value = null
})

describe('TableCard', () => {
  it('links every key of a listing to the bucket it lists', async () => {
    const markup = await render({ title: 'Objects', columns: ['Key'], rows: KEYS, bucket: 'test' })

    expect(markup).toContain('href="/app/buckets/test?object=preview_check.json"')
    expect(markup).toContain('href="/app/buckets/test?object=preview_check.py"')
    expect(markup).toContain(
      'href="/app/buckets/test?prefix=.aruna%2Fscripts%2F01M1NXNBGEHRPH8JFV7F40WE1M'
      + '&amp;object=.aruna%2Fscripts%2F01M1NXNBGEHRPH8JFV7F40WE1M%2Fscript.py"',
    )
    expect(markup).toContain('href="/app/buckets/test?prefix=notes&amp;object=notes%2Fhello.txt"')
    expect(markup).not.toContain('/app/buckets/notes')
  })

  it('takes the bucket from the page when the table declared none', async () => {
    const markup = await render({ title: 'Objects', columns: ['Key'], rows: KEYS }, 'test')

    expect(markup).toContain('href="/app/buckets/test?prefix=notes&amp;object=notes%2Fhello.txt"')
  })

  it('links no cell at all when no bucket is known', async () => {
    // Half a listing linked reads as broken, and the split invents a bucket.
    const markup = await render({ title: 'Objects', columns: ['Key'], rows: KEYS })

    expect(markup).not.toContain('/app/buckets/')
  })

  it('offers the bucket it lists as its own link', async () => {
    const markup = await render({ title: 'Objects', columns: ['Key'], rows: KEYS, bucket: 'test' })

    expect(markup).toContain('href="/app/buckets/test" data-bucket="test"')
  })

  it('keeps a long value on one line instead of widening the table', async () => {
    // A long id must ellipsize, never wrap mid token across two lines.
    const etag = '"d41d8cd98f00b204e9800998ecf8427e-217f3b9c0a1d4e6f"'
    const markup = await render({ title: 'Objects', columns: ['Key', 'ETag'], rows: [['a.json', etag]] })

    expect(markup).not.toContain('min-w-max')
    expect(markup).not.toContain('wrap-anywhere')
    expect(markup).toContain('truncate')
    expect(markup).toContain(`title="${etag.replaceAll('"', '&quot;')}"`)
  })
})
