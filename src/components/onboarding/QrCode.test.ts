import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import { encode } from 'uqr'
import QrCode from './QrCode.vue'

const VALUE = 'aruna://enroll?secret=01JBQ7Z2K3M4N5P6Q7R8S9T0AB'

function render(value: string): Promise<string> {
  return renderToString(createSSRApp({ render: () => h(QrCode, { value }) }))
}

describe('QrCode', () => {
  it('renders an svg sized to the encoded matrix', async () => {
    const html = await render(VALUE)
    const size = encode(VALUE, { border: 2 }).size
    expect(html).toContain('<svg')
    // The SSR serializer lowercases attribute names; the DOM renderer does not.
    expect(html.toLowerCase()).toContain(`viewbox="0 0 ${size} ${size}"`)
  })

  it('draws one path segment per dark module', async () => {
    const html = await render(VALUE)
    const dark = encode(VALUE, { border: 2 }).data.flat().filter(Boolean).length
    const drawn = (html.match(/M\d+ \d+h1v1h-1z/g) ?? []).length
    expect(drawn).toBe(dark)
    expect(dark).toBeGreaterThan(0)
  })
})
