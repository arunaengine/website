import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import Badge from './Badge.vue'

const render = (props: Record<string, unknown>) => renderToString(createSSRApp({ render: () => h(Badge, props, () => 'public') }))

describe('badge', () => {
  it('reads in sentence case at 12 px, even where a caller still asks for uppercase', async () => {
    const html = await render({ variant: 'success', size: 'sm', class: 'shrink-0 uppercase tracking-wide' })
    expect(html).toContain('text-xs')
    expect(html).toContain('shrink-0')
    expect(html).not.toContain('uppercase')
    expect(html).not.toContain('tracking-wide')
    expect(html).not.toMatch(/text-\[1[01]px\]/)
  })
})
