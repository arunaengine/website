import SmallInfoCard from '~/components/card/small_info.vue'
import { mountWithNuxt } from '../../helpers/component'
import { describe, expect, it } from "vitest"

describe('components/card/small_info', () => {
  it('renders text for id and name variants', async () => {
    const idWrapper = await mountWithNuxt(SmallInfoCard, {
      props: {
        icon_id: 'ID',
        text: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      },
    })

    const nameWrapper = await mountWithNuxt(SmallInfoCard, {
      props: {
        icon_id: 'Name',
        text: 'Resource Name',
      },
    })

    expect(idWrapper.text()).toContain('ID')
    expect(idWrapper.text()).toContain('01ARZ3NDEKTSV4RRFFQ69G5FAV')
    expect(nameWrapper.text()).toContain('Name')
    expect(nameWrapper.text()).toContain('Resource Name')
  })

  it('renders analytics label with empty text safely', async () => {
    const wrapper = await mountWithNuxt(SmallInfoCard, {
      props: {
        icon_id: 'Analytics',
        text: undefined,
      },
    })

    expect(wrapper.text()).toContain('Analytics')
  })
})
