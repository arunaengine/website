import NavigationTop from '~/components/navigation/top.vue'
import { mountWithNuxt } from '../../helpers/component'
import { createUser } from '../../helpers/user'

vi.mock('virtual:public?%2Fimgs%2Faruna_dark.webp', () => ({ default: '/imgs/aruna_dark.webp' }))

vi.mock('~/components/custom-ui/dialog/LoginDialog.vue', () => ({
  default: {
    template: '<div data-test="login-dialog">Login Dialog</div>',
  },
}))

describe('components/navigation/top', () => {
  const originalLocation = window.location

  function setHostname(hostname: string) {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        hostname,
      },
    })
  }

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
  })

  it('shows guest navigation and login dialog when no user is injected', async () => {
    setHostname('aruna.example.org')

    const wrapper = await mountWithNuxt(NavigationTop, {
      global: {
        provide: {
          userRef: ref(undefined),
        },
      },
    })

    expect(wrapper.text()).toContain('Search')
    expect(wrapper.text()).toContain('News')
    expect(wrapper.find('[data-test="login-dialog"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Administration')
  })

  it('shows authenticated navigation for admins', async () => {
    setHostname('dev.aruna.example.org')

    const wrapper = await mountWithNuxt(NavigationTop, {
      global: {
        provide: {
          userRef: ref(
            createUser({
              displayName: 'Admin User',
              attributes: {
                globalAdmin: true,
              },
            })
          ),
        },
      },
    })

    expect(wrapper.text()).toContain('Admin User')
    expect(wrapper.text()).toContain('Administration')
    expect(wrapper.text()).toContain('Account')
    expect(wrapper.text()).toContain('Resources')
    expect(wrapper.text()).toContain('Logout')
    expect(wrapper.text()).toContain('API')
    expect(wrapper.text()).not.toContain('Login Dialog')
  })

  it('uses the production api docs link away from dev hosts', async () => {
    setHostname('aruna.example.org')

    const wrapper = await mountWithNuxt(NavigationTop, {
      global: {
        provide: {
          userRef: ref(
            createUser({
              displayName: 'Regular User',
            })
          ),
        },
      },
    })

    expect(wrapper.html()).toContain('https://api.aruna-engine.org')
    expect(wrapper.html()).not.toContain('https://api.dev.aruna-engine.org')
    expect(wrapper.text()).not.toContain('Administration')
  })
})
