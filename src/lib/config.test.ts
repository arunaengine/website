import { describe, expect, it } from 'vitest'
import { applyPortalConfig } from '@/lib/config'

describe('portal login config', () => {
  it('keeps named options with string params and drops the rest', () => {
    const { login } = applyPortalConfig({
      login: {
        options: [
          { name: 'SSO', logo: '/sso.webp', params: { kc_idp_hint: 'sso', bad: 1 }, linkParams: { kc_action: 'idp_link:sso' } },
          { name: ' ', params: {} },
          'not an option',
          { name: 'Realm', description: 'Plain sign-in' },
        ],
        accountUrl: 'https://idp.example.org/account',
      },
    })
    expect(login.options).toEqual([
      { name: 'SSO', description: '', logo: '/sso.webp', logoLight: undefined, params: { kc_idp_hint: 'sso' }, linkParams: { kc_action: 'idp_link:sso' } },
      { name: 'Realm', description: 'Plain sign-in', logo: '', logoLight: undefined, params: {}, linkParams: {} },
    ])
    expect(login.accountUrl).toBe('https://idp.example.org/account')
  })

  it('has no options and no account page without config', () => {
    expect(applyPortalConfig({}).login).toEqual({ options: [], accountUrl: '' })
  })
})
