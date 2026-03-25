import {afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import type { Component } from 'vue'
import { authProviders, localAuthProvider } from '~/tests/fixtures/auth-providers'
import { mountWithDefaults } from '~/tests/helpers/component'

vi.mock('virtual:public?%2Fimgs%2Fkeycloak.webp', () => ({ default: '/imgs/keycloak.webp' }))
vi.mock('virtual:public?%2Fimgs%2Fls-ri.webp', () => ({ default: '/imgs/ls-ri.webp' }))
vi.mock('virtual:public?%2Fimgs%2Fgfbio.webp', () => ({ default: '/imgs/gfbio.webp' }))
vi.mock('virtual:public?%2Fimgs%2Fiam4nfdi.webp', () => ({ default: '/imgs/iam4nfdi.webp' }))

describe('LoginDialog', () => {
  const originalLocation = window.location
  let LoginDialog: Component

  function setHostname(hostname: string) {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        hostname,
      },
    })
  }

  beforeAll(async () => {
    LoginDialog = (await import('~/components/custom-ui/dialog/LoginDialog.vue')).default
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
  })

  it('renders configured remote provider links', () => {
    setHostname('aruna.example.org')

    const wrapper = mountWithDefaults(LoginDialog)
    const links = wrapper.findAll('a')

    expect(links).toHaveLength(authProviders.length)

    for (const provider of authProviders) {
      const link = links.find(item => item.text().includes(provider.label))
      expect(link?.attributes('href')).toBe(provider.href)
    }
  })

  it('shows local provider on localhost', () => {
    setHostname('localhost')

    const wrapper = mountWithDefaults(LoginDialog)
    const localLink = wrapper.findAll('a').find(link => link.text().includes(localAuthProvider.label))

    expect(localLink?.attributes('href')).toBe(localAuthProvider.href)
  })

  it('hides local provider away from localhost', () => {
    setHostname('app.aruna.example.org')

    const wrapper = mountWithDefaults(LoginDialog)

    expect(wrapper.text()).not.toContain(localAuthProvider.label)
  })
})
