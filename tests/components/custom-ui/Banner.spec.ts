import Banner from '~/components/custom-ui/Banner.vue'
import { mountWithDefaults } from '../../helpers/component'
import { describe, expect, it } from "vitest"

describe('Banner', () => {
  it('renders custom image when provided', () => {
    const wrapper = mountWithDefaults(Banner, {
      props: {
        type: 'info',
        title: 'Notice',
        text: '<strong>Important</strong> update',
        customImg: '/img/custom-banner.png',
      },
      global: {
        stubs: {
          Alert: { template: '<div data-test="alert"><slot /></div>' },
          AlertTitle: { template: '<div data-test="alert-title"><slot /></div>' },
          AlertDescription: { template: '<div data-test="alert-description"><slot /></div>' },
          Button: { template: '<button data-test="close-button"><slot /></button>' },
        },
      },
    })

    const img = wrapper.get('img')

    expect(img.attributes('src')).toBe('/img/custom-banner.png')
    expect(wrapper.html()).toContain('<strong>Important</strong> update')
    expect(wrapper.text()).toContain('Notice')
  })

  it('renders icon matching the banner type when no custom image is present', () => {
    const wrapper = mountWithDefaults(Banner, {
      props: {
        type: 'maintenance',
        title: 'Maintenance',
        text: 'Scheduled maintenance',
        customImg: '',
      },
      global: {
        stubs: {
          Alert: { template: '<div><slot /></div>' },
          AlertTitle: { template: '<div><slot /></div>' },
          AlertDescription: { template: '<div><slot /></div>' },
          Button: { template: '<button><slot /></button>' },
        },
      },
    })

    expect(wrapper.find('#myClip').exists()).toBe(true)
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('emits hideBanner when close button is clicked', async () => {
    const wrapper = mountWithDefaults(Banner, {
      props: {
        type: 'info',
        title: 'Info',
        text: 'Banner text',
        customImg: '',
      },
      global: {
        stubs: {
          Alert: { template: '<div><slot /></div>' },
          AlertTitle: { template: '<div><slot /></div>' },
          AlertDescription: { template: '<div><slot /></div>' },
          Button: { template: '<button data-test="close-button"><slot /></button>' },
        },
      },
    })

    await wrapper.get('[data-test="close-button"]').trigger('click')

    expect(wrapper.emitted('hideBanner')).toHaveLength(1)
  })
})
