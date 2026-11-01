import { describe, expect, it } from 'vitest'
import { linkedAccountsUrl, offersProviders } from './loginProviders'

describe('offersProviders', () => {
  it.each([
    'https://keycloak.v3.aruna-engine.org/realms/aruna',
    'https://keycloak.v3-debug.aruna-engine.org/realms/aruna',
    'https://aruna-engine.org/realms/aruna',
  ])('offers the logins for %s', (issuer) => {
    expect(offersProviders(issuer)).toBe(true)
  })

  it.each([
    ['another domain', 'https://login.example.org/realms/aruna'],
    ['a look-alike host', 'https://evil-aruna-engine.org/realms/aruna'],
    ['the domain as a prefix', 'https://aruna-engine.org.example.com/realms/aruna'],
    ['the domain in the path', 'https://example.com/aruna-engine.org'],
    ['no issuer', undefined],
    ['a malformed issuer', 'not a url'],
  ])('offers nothing for %s', (_, issuer) => {
    expect(offersProviders(issuer)).toBe(false)
  })
})

describe('linkedAccountsUrl', () => {
  it('points at the Keycloak account page of the issuer', () => {
    expect(linkedAccountsUrl('https://keycloak.v3.aruna-engine.org/realms/aruna/')).toBe(
      'https://keycloak.v3.aruna-engine.org/realms/aruna/account/account-security/linked-accounts',
    )
  })
})
