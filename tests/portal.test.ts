import {beforeEach, describe, expect, test} from 'bun:test'
import {config, createHandler, fetchCalls, idpMetadata, replyWith} from './harness'
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
    expect(sent).toEqual({...portalAuth, redirect_uri: 'https://web.test/callback', scope: 'openid', state: sent.state})
    expect(portalReturn(sent.state)).toEqual({callback: portal, state: 'portal-state'})
  })

  test('asks upstream for the v2 scope of the provider', async () => {
    const scope = config.provider.iam4nfdi.scope
    config.provider.iam4nfdi.scope = ['openid', 'email']
    try {
      const response = await authorize('iam4nfdi', nfdiAuth)
      expect(new URL(response.headers.get('location')!).searchParams.get('scope')).toBe('openid email')
    } finally {
      config.provider.iam4nfdi.scope = scope
    }
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

describe('portal callback', () => {
  function callback(query: string) {
    return handler(new Request(`https://web.test/callback?${query}`, {headers: {cookie: 'login_meta=keep; access_token=v2'}}))
  }

  test('sends code and portal state back to the portal', async () => {
    const start = await authorize('lifescience', portalAuth)
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!
    const back = await callback(`code=c-1&iss=x&next=https://evil.test&state=${encodeURIComponent(state)}`)
    expect(back.status).toBe(302)
    expect(back.headers.getSetCookie()).toEqual([])
    const location = new URL(back.headers.get('location')!)
    expect(location.origin + location.pathname).toBe(portal)
    expect(Object.fromEntries(location.searchParams)).toEqual({code: 'c-1', iss: 'x', state: 'portal-state'})
  })

  test('forwards provider errors to the portal', async () => {
    const state = portalState('iam4nfdi', portal, 's')
    const back = await callback(`error=access_denied&state=${encodeURIComponent(state)}`)
    expect(Object.fromEntries(new URL(back.headers.get('location')!).searchParams))
      .toEqual({error: 'access_denied', state: 's'})
  })

  test('rejects foreign portal targets and unknown providers', async () => {
    for (const state of [
      portalState('lifescience', 'https://evil.test/auth/callback', 's'),
      portalState('lifescience', 'https://v3.aruna-engine.org/auth/callback?next=x', 's'),
      portalState('local', portal, 's'),
      portalState('lifescience', portal, ''),
      'v3p.lifescience.!!.s',
    ]) {
      const back = await callback(`code=c-1&state=${encodeURIComponent(state)}`)
      expect(back.status).toBe(400)
      expect(back.headers.get('location')).toBeNull()
    }
    expect(fetchCalls).toHaveLength(0)
  })
})

describe('portal token', () => {
  const exchange = {grant_type: 'authorization_code', code: 'c-1', redirect_uri: portal, code_verifier: 'v-1', client_id: 'ls-client'}
  const upstreamTokens = {access_token: 'at', refresh_token: 'rt', id_token: 'it', token_type: 'Bearer', expires_in: 300, scope: 'openid'}
  const origin = 'https://v3-debug.aruna-engine.org'

  function token(provider: string, params: Record<string, string> | string, headers: Record<string, string> = {origin}) {
    return handler(new Request(`https://web.test/v3-bridge/${provider}/token`, {
      method: 'POST',
      headers: {'content-type': 'application/x-www-form-urlencoded', ...headers},
      body: typeof params === 'string' ? params : new URLSearchParams(params).toString(),
    }))
  }

  beforeEach(() => replyWith(url => {
    if (url.endsWith('/.well-known/openid-configuration')) return idpMetadata(url)
    if (url.endsWith('/token')) return upstreamTokens
    throw new Error(`unexpected fetch ${url}`)
  }))

  test('returns only the id token', async () => {
    const response = await token('lifescience', exchange)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('access-control-allow-origin')).toBe(origin)
    expect(response.headers.get('access-control-allow-credentials')).toBeNull()
    expect(await response.json()).toEqual({id_token: 'it', token_type: 'Bearer', expires_in: 300})
    const call = fetchCalls.find(c => c.url === 'https://lifescience.test/token')!
    expect(call.options.headers['Authorization']).toBe('Basic ' + btoa('ls-client:ls-secret'))
    expect(Object.fromEntries(call.options.body)).toEqual({
      grant_type: 'authorization_code', code: 'c-1', redirect_uri: 'https://web.test/callback', code_verifier: 'v-1',
    })
  })

  test('uses client secret post and no verifier where v2 does', async () => {
    const response = await token('iam4nfdi', {...exchange, client_id: 'aruna-engine.org/callback'})
    expect(response.status).toBe(200)
    const call = fetchCalls.find(c => c.url === 'https://iam4nfdi.test/token')!
    expect(call.options.headers['Authorization']).toBeUndefined()
    expect(Object.fromEntries(call.options.body)).toEqual({
      grant_type: 'authorization_code', code: 'c-1', redirect_uri: 'https://web.test/callback',
      client_id: 'aruna-engine.org/callback', client_secret: 'nfdi-secret',
    })
  })

  test('provider errors and missing id token give no tokens', async () => {
    replyWith(url => url.endsWith('/token')
      ? Response.json({error: 'invalid_grant', access_token: 'leak'}, {status: 400})
      : idpMetadata(url))
    const failed = await token('lifescience', exchange)
    expect(failed.status).toBe(400)
    expect(await failed.json()).toEqual({error: 'invalid_grant'})

    replyWith(url => url.endsWith('/token') ? {access_token: 'at'} : idpMetadata(url))
    const missing = await token('lifescience', exchange)
    expect(missing.status).toBe(502)
    expect(await missing.json()).toEqual({error: 'server_error', error_description: 'No ID token from provider'})
  })

  test('rejects invalid portal requests without forwarding', async () => {
    const cases: [Record<string, string> | string, number, string][] = [
      [{...exchange, client_id: 'other'}, 401, 'invalid_client'],
      [{...exchange, client_id: ''}, 401, 'invalid_client'],
      [{...exchange, code_verifier: ''}, 400, 'invalid_request'],
      [{...exchange, code: ''}, 400, 'invalid_request'],
      [{...exchange, grant_type: 'refresh_token'}, 400, 'unsupported_grant_type'],
      [`${new URLSearchParams(exchange)}&code_verifier=v-2`, 400, 'invalid_request'],
    ]
    for (const [params, status, error] of cases) {
      const response = await token('lifescience', params)
      expect(response.status).toBe(status)
      expect(await response.json()).toEqual({error})
    }
    for (const redirect_uri of ['https://evil.test/auth/callback', `${portal}?x=1`, 'https://aruna-engine.org/auth/callback']) {
      expect((await token('lifescience', {...exchange, redirect_uri})).status).toBe(400)
    }
    expect((await token('local', {...exchange, client_id: 'local-client'})).status).toBe(404)
    expect(fetchCalls).toHaveLength(0)
  })

  test('cors only for portal origins', async () => {
    for (const other of ['https://evil.test', 'http://v3.aruna-engine.org', 'https://aruna-engine.org',
      'https://v3.aruna-engine.org:8443', 'https://v3.aruna-engine.org.evil.com', 'null']) {
      const response = await token('lifescience', exchange, {origin: other})
      expect(response.headers.get('access-control-allow-origin')).toBeNull()
      expect(response.headers.get('vary')).toContain('Origin')
    }
    expect(portalOrigin('https://a.b.aruna-engine.org')).toBe(true)
    expect(portalOrigin('https://a.aruna-engine.org/')).toBe(false)
  })

  test('answers the preflight', async () => {
    const preflight = (from: string) => handler(new Request('https://web.test/v3-bridge/lifescience/token', {
      method: 'OPTIONS',
      headers: {origin: from, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type'},
    }))
    const allowed = await preflight(origin)
    expect(allowed.status).toBe(204)
    expect(allowed.headers.get('access-control-allow-origin')).toBe(origin)
    expect(allowed.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS')
    expect(allowed.headers.get('access-control-allow-headers')).toBe('Content-Type')
    expect(allowed.headers.get('access-control-allow-credentials')).toBeNull()
    expect(allowed.headers.get('vary')).toContain('Origin')
    const refused = await preflight('https://evil.test')
    expect(refused.headers.get('access-control-allow-origin')).toBeNull()
  })

  test('keycloak exchange still passes upstream body through', async () => {
    const broker = 'https://kc.test/realms/aruna/broker/lifescience/endpoint'
    const response = await token('lifescience', {...exchange, redirect_uri: broker}, {authorization: 'Basic ' + btoa('ls-client:ls-secret')})
    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    expect(await response.json()).toEqual(upstreamTokens)
  })
})

test('full portal login returns only the id token', async () => {
  replyWith(url => url.endsWith('/token') ? {access_token: 'at', refresh_token: 'rt', id_token: 'it', expires_in: 60} : idpMetadata(url))
  const start = await authorize('lifescience', portalAuth)
  const state = new URL(start.headers.get('location')!).searchParams.get('state')!
  const back = await handler(new Request(`https://web.test/callback?code=c-9&state=${encodeURIComponent(state)}`))
  const returned = new URL(back.headers.get('location')!)
  expect(returned.origin + returned.pathname).toBe(portal)
  const response = await handler(new Request('https://web.test/v3-bridge/lifescience/token', {
    method: 'POST',
    headers: {'content-type': 'application/x-www-form-urlencoded', origin: 'https://v3-debug.aruna-engine.org'},
    body: new URLSearchParams({
      grant_type: 'authorization_code', code: returned.searchParams.get('code')!, redirect_uri: portal,
      code_verifier: 'v-9', client_id: 'ls-client',
    }).toString(),
  }))
  expect(await response.json()).toEqual({id_token: 'it', token_type: 'Bearer', expires_in: 60})
})
