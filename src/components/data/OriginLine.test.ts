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

  it('says how an upload came in and who started a run', async () => {
    const text = async (origin: object, short = false) =>
      (await renderToString(createSSRApp(OriginLine, { short, origin }))).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    const upload = { kind: 'upload', user: 'Ada', node: 'node 1', time: '2026-10-20T10:12:00Z' }
    expect(await text({ ...upload, client: 'portal' }, true)).toBe('Uploaded by Ada from the portal, 2026-10-20')
    expect(await text({ ...upload, client: 's3' })).toMatch(/^Uploaded by Ada via S3 on node 1, /)
    expect(await text({ ...upload, client: 'device', device: 'laptop' }, true)).toBe('Uploaded by Ada from device laptop, 2026-10-20')
    expect(await text({ kind: 'job', run: 'r-01', startedBy: 'Ada' }, true)).toBe('Written by the run r-01. Started by Ada')
    expect(await text({ kind: 'source', source: '', path: 'a.bin', connector: 'Lab archive' }, true)).toBe('From Lab archive')
  })
})
