import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'

const BucketChooser = (await import('./BucketChooser.vue')).default

describe('bucket chooser', () => {
  it('shows only the no bucket open message, with no bucket hints', async () => {
    const html = await renderToString(createSSRApp(BucketChooser))
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

    expect(text).toContain('No bucket open')
    expect(text).toContain('Choose a bucket to see its files.')
    expect(html).not.toContain('<a')
    expect(html).not.toContain('<ul')
  })
})
