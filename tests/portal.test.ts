import {beforeEach, describe, expect, test} from 'bun:test'
import {createHandler, fetchCalls, idpMetadata, replyWith} from './harness'
import {portalCallback, portalOrigin, portalReturn, portalState} from '../server/utils/oidc'

const handler = await createHandler()
const portal = 'https://v3-debug.aruna-engine.org/auth/callback'
const portalAuth = {
  client_id: 'ls-client',
  redirect_uri: portal,
  response_type: 'code',
  scope: 'openid profile email',
  state: 'portal-state',
  code_challenge: 'challenge',
  code_challenge_method: 'S256',
}
const nfdiAuth = {...portalAuth, client_id: 'aruna-engine.org/callback'}

beforeEach(() => replyWith(url => {
  if (url.endsWith('/.well-known/openid-configuration')) return idpMetadata(url)
  throw new Error(`unexpected fetch ${url}`)
}))

function authorize(provider: string, params: Record<string, string>) {
  const query = new URLSearchParams(params)
  return handler(new Request(`https://web.test/v3-bridge/${provider}/authorize?${query}`))
}

test('portal callback rule', () => {
  for (const url of [portal, 'https://a.b-c.aruna-engine.org/auth/callback', 'https://xn--bcher-kva.aruna-engine.org/auth/callback']) {
    expect(portalCallback(url)).toBe(true)
  }
  for (const url of [
    'https://aruna-engine.org/auth/callback',
    'http://v3.aruna-engine.org/auth/callback',
    'https://v3.aruna-engine.org:8443/auth/callback',
    'https://v3.aruna-engine.org:443/auth/callback',
    'https://user@v3.aruna-engine.org/auth/callback',
    'https://user:pw@v3.aruna-engine.org/auth/callback',
    'https://v3.aruna-engine.org/auth/callback?',
    'https://v3.aruna-engine.org/auth/callback?next=x',
    'https://v3.aruna-engine.org/auth/callback#',
    'https://v3.aruna-engine.org/auth/callback#x',
    'https://v3.aruna-engine.org/auth/callback/',
    'https://v3.aruna-engine.org/auth/callback/../callback',
    'https://v3.aruna-engine.org/other',
    'https://V3.aruna-engine.org/auth/callback',
    'https://v3_x.aruna-engine.org/auth/callback',
    'https://v3.aruna-engine.org.evil.com/auth/callback',
    'https://evil-aruna-engine.org/auth/callback',
    'https://v3..aruna-engine.org/auth/callback',
    'https://v3.aruna-engine.org./auth/callback',
    ' https://v3.aruna-engine.org/auth/callback',
    'not a url',
    undefined,
    ['https://v3.aruna-engine.org/auth/callback'],
  ]) {
    expect(portalCallback(url)).toBe(false)
  }
})

test('portal state round trip', () => {
  const state = portalState('lifescience', portal, 'a.b.c')
  expect(state.startsWith('v3p.lifescience.')).toBe(true)
  expect(portalReturn(state)).toEqual({callback: portal, state: 'a.b.c'})
  const evil = portalState('lifescience', 'https://evil.test/auth/callback', 's')
  for (const bad of [evil, portalState('local', portal, 's'), portalState('lifescience', portal, ''), 'v3p.lifescience', `v3.lifescience.s`]) {
    expect(portalReturn(bad)).toBeUndefined()
  }
})

describe('portal authorize', () => {
  test('sends user to provider with v2 redirect uri and wrapped state', async () => {
    const response = await authorize('lifescience', portalAuth)
    expect(response.status).toBe(302)
    expect(response.headers.getSetCookie()).toEqual([])
    const location = new URL(response.headers.get('location')!)
    expect(location.origin + location.pathname).toBe('https://lifescience.test/authorize')
    const sent = Object.fromEntries(location.searchParams)
    expect(sent).toEqual({...portalAuth, redirect_uri: 'https://web.test/callback', state: sent.state})
    expect(portalReturn(sent.state)).toEqual({callback: portal, state: 'portal-state'})
  })

  test('drops pkce upstream for providers without it', async () => {
    const response = await authorize('iam4nfdi', nfdiAuth)
    expect(response.status).toBe(302)
    const sent = new URL(response.headers.get('location')!).searchParams
    expect(sent.get('code_challenge')).toBeNull()
    expect(sent.get('code_challenge_method')).toBeNull()
    expect(sent.get('redirect_uri')).toBe('https://web.test/callback')
  })

  test('rejects bad portal requests', async () => {
    for (const params of [
      {...portalAuth, redirect_uri: 'https://v3.aruna-engine.org/auth/callback?x=1'},
      {...portalAuth, redirect_uri: 'https://evil.test/auth/callback'},
      {...portalAuth, client_id: 'other'},
      {...portalAuth, response_type: 'token'},
      {...portalAuth, state: ''},
      {...portalAuth, code_challenge: ''},
      {...portalAuth, code_challenge_method: 'plain'},
    ]) {
      const response = await authorize('lifescience', params)
      expect(response.status).toBe(400)
      expect(response.headers.get('location')).toBeNull()
    }
    expect((await authorize('local', {...portalAuth, client_id: 'local-client'})).status).toBe(404)
    expect(fetchCalls).toHaveLength(0)
  })
})
