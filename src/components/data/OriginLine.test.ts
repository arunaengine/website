import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it, vi } from 'vitest'

vi.mock('vue-router', () => ({ RouterLink: defineComponent((_, { slots }) => () => h('a', slots.default?.())) }))

const OriginLine = (await import('./OriginLine.vue')).default

describe('origin line', () => {
  it('names the run that wrote a file in the file details', async () => {
    const html = await renderToString(createSSRApp(OriginLine, { short: true, origin: { kind: 'job', run: 'r-01' } }))
    expect(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).toBe('Written by the run r-01')
  })
})
