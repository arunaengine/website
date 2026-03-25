import AuthorsCard from '~/components/card/authors.vue'
import { mountWithNuxt } from '../../helpers/component'
import {describe, expect, it, vi } from "vitest"

vi.mock('virtual:public?%2Fimgs%2FORCIDiD_icon24x24.png', () => ({ default: '/imgs/ORCIDiD_icon24x24.png' }))

describe('components/card/authors', () => {
  it('renders author names, emails, and orcid links', async () => {
    const wrapper = await mountWithNuxt(AuthorsCard, {
      props: {
        authors: [
          {
            firstName: 'Ada',
            lastName: 'Lovelace',
            email: 'ada@example.org',
            orcid: '0000-0002-1825-0097',
          },
        ],
      },
    })

    expect(wrapper.text()).toContain('Ada Lovelace')
    expect(wrapper.text()).toContain('ada@example.org')
    expect(wrapper.html()).toContain('mailto:ada@example.org')
    expect(wrapper.html()).toContain('https://orcid.org/0000-0002-1825-0097')
  })

  it('renders empty author state without failing', async () => {
    const wrapper = await mountWithNuxt(AuthorsCard, {
      props: {
        authors: undefined,
      },
    })

    expect(wrapper.text()).toContain('Name')
    expect(wrapper.text()).toContain('Email')
    expect(wrapper.text()).toContain('ORCID')
  })
})
