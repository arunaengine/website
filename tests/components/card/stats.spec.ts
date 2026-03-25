import StatsCard from '~/components/card/stats.vue'
import { mountWithNuxt } from '../../helpers/component'

describe('components/card/stats', () => {
  it('renders count and formatted size when stats are present', async () => {
    const wrapper = await mountWithNuxt(StatsCard, {
      props: {
        stats: {
          count: '4',
          size: '2048',
          lastUpdated: '2024-01-01T00:00:00.000Z',
        },
      },
    })

    expect(wrapper.text()).toContain('Count')
    expect(wrapper.text()).toContain('4')
    expect(wrapper.text()).toContain('2 KB')
  })

  it('falls back to N/A Bytes when size is missing', async () => {
    const wrapper = await mountWithNuxt(StatsCard, {
      props: {
        stats: {
          count: '0',
          size: '',
          lastUpdated: '2024-01-01T00:00:00.000Z',
        },
      },
    })

    expect(wrapper.text()).toContain('0')
    expect(wrapper.text()).toContain('N/A Bytes')
  })
})
