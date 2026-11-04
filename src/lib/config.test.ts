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

  it('reads the provider and bridge of an upstream login only when both are set', () => {
    const { login } = applyPortalConfig({
      login: {
        options: [
          { name: 'LS', provider: ' lifescience ', bridge: 'https://bridge.example.org/v3-bridge/lifescience/' },
          { name: 'No bridge', provider: 'gfbio' },
          { name: 'No provider', bridge: 'https://bridge.example.org/v3-bridge/gfbio' },
          { name: 'Bad', provider: 1, bridge: 'https://bridge.example.org' },
        ],
      },
    })
    expect(login.options.map((option) => option.upstream)).toEqual([
      { provider: 'lifescience', bridge: 'https://bridge.example.org/v3-bridge/lifescience' },
      undefined,
      undefined,
      undefined,
    ])
  })

  it('has no options and no account page without config', () => {
    expect(applyPortalConfig({}).login).toEqual({ options: [], accountUrl: '' })
  })
})
