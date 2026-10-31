import {beforeEach, describe, expect, test} from 'bun:test'
import crypto from 'crypto'
import {cookieValue, createHandler, fetchCalls, idpMetadata, replyWith} from './harness'

const handler = await createHandler()
const tokens = {access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 300, refresh_expires_in: 1800}

function providerReply(url: string) {
  if (url.endsWith('/.well-known/openid-configuration')) return idpMetadata(url)
  if (url.endsWith('/token')) return tokens
  if (url === '/api/user/oidc') return {}
  throw new Error(`unexpected fetch ${url}`)
}

async function startLogin(provider: string, extra = '') {
  const response = await handler(new Request(`https://web.test/auth/login?provider=${provider}${extra}`))
  expect(response.status).toBe(302)
  const location = new URL(response.headers.get('location')!)
  const loginMeta = cookieValue(response, 'login_meta')!
  return {location, loginMeta}
}

function finishLogin(query: string, cookie: string) {
  return handler(new Request(`https://web.test/callback?${query}`, {headers: {cookie}}))
}

beforeEach(() => replyWith(providerReply))

describe('v2 login', () => {
  test('pkce provider redirects with code challenge', async () => {
    const {location, loginMeta} = await startLogin('lifescience')
    expect(location.origin + location.pathname).toBe('https://lifescience.test/authorize')
    expect(location.searchParams.get('client_id')).toBe('ls-client')
    expect(location.searchParams.get('redirect_uri')).toBe('https://web.test/callback')
    expect(location.searchParams.get('response_type')).toBe('code')
    expect(location.searchParams.get('scope')).toBe('openid')
    expect(location.searchParams.get('code_challenge_method')).toBe('S256')
    const meta = JSON.parse(decodeURIComponent(loginMeta))
    expect(meta.provider).toBe('lifescience')
    const challenge = crypto.createHash('sha256').update(meta.code_verifier).digest('base64url')
    expect(location.searchParams.get('code_challenge')).toBe(challenge)
  })

  test('callback exchanges code and sets session cookies', async () => {
    const {location, loginMeta} = await startLogin('lifescience')
    const state = location.searchParams.get('state')
    const response = await finishLogin(`code=abc${state ? `&state=${state}` : ''}`, `login_meta=${loginMeta}`)
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/')
    expect(cookieValue(response, 'access_token')).toBe('new-access')
    expect(cookieValue(response, 'refresh_token')).toBe('new-refresh')
    expect(cookieValue(response, 'login_meta')).toBe('')

    const token = fetchCalls.find(c => c.url === 'https://lifescience.test/token')!
    const body = new URLSearchParams(token.options.body)
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code')).toBe('abc')
    expect(body.get('redirect_uri')).toBe('https://web.test/callback')
    expect(body.get('code_verifier')).toBe(JSON.parse(decodeURIComponent(loginMeta)).code_verifier)
    expect(token.options.headers['Authorization']).toBe('Basic ' + btoa('ls-client:ls-secret'))
  })

  test('post auth provider sends client secret in body', async () => {
    const {location, loginMeta} = await startLogin('iam4nfdi')
    expect(location.searchParams.has('code_challenge')).toBe(false)
    const state = location.searchParams.get('state')
    const response = await finishLogin(`code=abc${state ? `&state=${state}` : ''}`, `login_meta=${loginMeta}`)
    expect(response.status).toBe(302)
    expect(cookieValue(response, 'access_token')).toBe('new-access')

    const token = fetchCalls.find(c => c.url === 'https://iam4nfdi.test/token')!
    const body = new URLSearchParams(token.options.body)
    expect(body.get('client_id')).toBe('aruna-engine.org/callback')
    expect(body.get('client_secret')).toBe('nfdi-secret')
    expect(body.has('code_verifier')).toBe(false)
    expect(token.options.headers['Authorization']).toBeUndefined()
  })

  test('keycloak provider login still works', async () => {
    const {location, loginMeta} = await startLogin('local')
    expect(location.origin + location.pathname).toBe('https://local.test/authorize')
    const state = location.searchParams.get('state')
    const response = await finishLogin(`code=abc${state ? `&state=${state}` : ''}`, `login_meta=${loginMeta}`)
    expect(response.headers.get('location')).toBe('/')
    expect(cookieValue(response, 'access_token')).toBe('new-access')
  })

  test('add identity provider keeps current session', async () => {
    const {location, loginMeta} = await startLogin('lifescience', '&add_idp=true')
    const state = location.searchParams.get('state')
    const cookie = `login_meta=${loginMeta}; access_token=old-access`
    const response = await finishLogin(`code=abc${state ? `&state=${state}` : ''}`, cookie)
    expect(response.headers.get('location')).toBe('/user/account?add=success')
    expect(cookieValue(response, 'access_token')).toBeUndefined()
    const patch = fetchCalls.find(c => c.url === '/api/user/oidc')!
    expect(patch.options.body).toEqual({accessToken: 'old-access', newAccessToken: 'new-access'})
  })

  test('callback without code is rejected', async () => {
    const response = await finishLogin('state=x', 'login_meta=x')
    expect(response.status).toBe(400)
    expect(fetchCalls).toHaveLength(0)
  })
})
