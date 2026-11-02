import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { describe, expect, it } from 'vitest'
import StatsCard from './StatsCard.vue'

type Props = { title: string; scope?: string; items: Array<{ label: string; value: string; hint?: string }> }

const render = (props: Props) => renderToString(createSSRApp({ render: () => h(StatsCard, props) }))

describe('StatsCard', () => {
  it('shows one number with its scope and no label that repeats the title', async () => {
    const markup = await render({ title: 'Objects', scope: 'Whole realm', items: [{ label: 'Objects', value: '44,018,207', hint: 'Summed over every node' }] })

    expect(markup).toContain('44,018,207')
    expect(markup).toContain('Whole realm')
    expect(markup).toContain('Summed over every node')
    expect(markup.match(/Objects/g)).toHaveLength(1)
  })

  it('shows several numbers side by side, each with its label', async () => {
    const markup = await render({
      title: 'Usage',
      items: [{ label: 'Stored', value: '1.2 TB' }, { label: 'Objects', value: '18,204' }, { label: 'Datasets', value: '12' }],
    })

    expect(markup).toContain('grid-cols-3')
    expect(markup).toContain('Stored')
    expect(markup).toContain('18,204')
    expect(markup).not.toContain('Whole realm')
  })
})
