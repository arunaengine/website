import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import { degradedRanges, mockBucket } from '@/lib/distributedMockData'
import DegradedNotice from './DegradedNotice.vue'
import PermissionNotice from './PermissionNotice.vue'

const render = (component: object, props: Record<string, unknown>) =>
  renderToString(createSSRApp({ render: () => h(component, props) }))

describe('distributed notices', () => {
  it('names the glob and the reason for a grant that misses nodes', async () => {
    const markup = await render(PermissionNotice, { holder: 'Genome Lab', bucket: 'bakrep', missing: ['node-3', 'node-5'] })
    expect(markup).toContain('/data/*/bakrep/**')
    expect(markup).toContain('node-3, node-5')
    expect(markup).toContain('fails when you have no permission on B')
  })

  it('names the range, the coordinator and the copies of a degraded range', async () => {
    const range = degradedRanges(mockBucket('bakrep')!)[0]
    const markup = await render(DegradedNotice, { range })
    expect(markup).toContain('range r-017')
    expect(markup).toContain('node-3')
    expect(markup).toContain('since 2026-10-23 08:12 UTC')
    expect(markup).toContain('copies on node-1')
  })
})
