import {beforeEach, describe, expect, test} from 'bun:test'
import {config, createHandler, fetchCalls, idpMetadata, replyWith} from './harness'

const handler = await createHandler()
const broker = (alias: string) => `https://kc.test/realms/aruna/broker/${alias}/endpoint`
const keycloakState = 'abc.tab-1.aruna-api'

beforeEach(() => replyWith(url => {
  if (url.endsWith('/.well-known/openid-configuration')) return idpMetadata(url)
  if (url.endsWith('/token')) return {access_token: 'at', id_token: 'it'}
  throw new Error(`unexpected fetch ${url}`)
}))

function authorize(provider: string, params: Record<string, string>) {
  const query = new URLSearchParams(params)
  return handler(new Request(`https://web.test/v3-bridge/${provider}/authorize?${query}`))
}

function callback(query: string) {
  return handler(new Request(`https://web.test/callback?${query}`, {headers: {cookie: 'login_meta=keep; access_token=v2'}}))
}

function token(provider: string, params: Record<string, string> | string, headers: Record<string, string> = {}) {
  return handler(new Request(`https://web.test/v3-bridge/${provider}/token`, {
    method: 'POST',
    headers: {'content-type': 'application/x-www-form-urlencoded', ...headers},
    body: typeof params === 'string' ? params : new URLSearchParams(params).toString(),
  }))
}

async function withoutBridge(run: () => Promise<void>) {
  const realmUrl = config.v3Bridge.realmUrl
  config.v3Bridge.realmUrl = ''
  try {
    await run()
  } finally {
    config.v3Bridge.realmUrl = realmUrl
  }
}

const lifescienceAuth = {
  client_id: 'ls-client',
  redirect_uri: broker('lifescience'),
  response_type: 'code',
  scope: 'openid profile email',
  state: keycloakState,
  nonce: 'n-1',
  code_challenge: 'challenge',
  code_challenge_method: 'S256',
}
const basicAuth = {authorization: 'Basic ' + btoa('ls-client:ls-secret')}
const codeExchange = {grant_type: 'authorization_code', code: 'c-1', redirect_uri: broker('lifescience'), code_verifier: 'v-1'}

describe('bridge authorize', () => {
  test('sends user to provider with v2 redirect uri', async () => {
    const response = await authorize('lifescience', lifescienceAuth)
    expect(response.status).toBe(302)
    expect(response.headers.getSetCookie()).toEqual([])
    const location = new URL(response.headers.get('location')!)
    expect(location.origin + location.pathname).toBe('https://lifescience.test/authorize')
    expect(Object.fromEntries(location.searchParams)).toEqual({
      ...lifescienceAuth,
      redirect_uri: 'https://web.test/callback',
      state: `v3.lifescience.${keycloakState}`,
    })
  })

  test('rejects foreign or other broker redirect uri', async () => {
    for (const redirect_uri of [
      'https://evil.test/realms/aruna/broker/lifescience/endpoint',
      broker('iam4nfdi'),
      `${broker('lifescience')}?next=https://evil.test`,
      'https://web.test/callback',
    ]) {
      const response = await authorize('lifescience', {...lifescienceAuth, redirect_uri})
      expect(response.status).toBe(400)
      expect(response.headers.get('location')).toBeNull()
    }
  })

  test('rejects wrong client and malformed requests', async () => {
    for (const params of [
      {...lifescienceAuth, client_id: 'other'},
      {...lifescienceAuth, response_type: 'token'},
      {...lifescienceAuth, state: ''},
    ]) {
      expect((await authorize('lifescience', params)).status).toBe(400)
    }
    const query = new URLSearchParams(lifescienceAuth)
    query.append('redirect_uri', 'https://evil.test')
    const duplicate = await handler(new Request(`https://web.test/v3-bridge/lifescience/authorize?${query}`))
    expect(duplicate.status).toBe(400)
  })

  test('unknown provider or disabled bridge is not found', async () => {
    const local = {...lifescienceAuth, client_id: 'local-client', redirect_uri: broker('local')}
    expect((await authorize('local', local)).status).toBe(404)
    expect((await authorize('constructor', lifescienceAuth)).status).toBe(404)
    await withoutBridge(async () => {
      expect((await authorize('lifescience', lifescienceAuth)).status).toBe(404)
    })
  })
})

describe('bridge callback', () => {
  test('forwards code and state to fixed broker url', async () => {
    const response = await callback(`code=c-1&state=v3.lifescience.${keycloakState}&iss=x&next=https://evil.test`)
    expect(response.status).toBe(302)
    expect(response.headers.getSetCookie()).toEqual([])
    const location = new URL(response.headers.get('location')!)
    expect(location.origin + location.pathname).toBe(broker('lifescience'))
    expect(Object.fromEntries(location.searchParams)).toEqual({code: 'c-1', state: keycloakState, iss: 'x'})
    expect(fetchCalls).toHaveLength(0)
  })

  test('forwards provider errors', async () => {
    const response = await callback(`error=access_denied&error_description=no&state=v3.iam4nfdi.${keycloakState}`)
    const location = new URL(response.headers.get('location')!)
    expect(location.origin + location.pathname).toBe(broker('iam4nfdi'))
    expect(Object.fromEntries(location.searchParams))
      .toEqual({error: 'access_denied', error_description: 'no', state: keycloakState})
  })

  test('rejects unknown or disabled bridge state', async () => {
    for (const state of ['v3.local.x', 'v3.evil.x', 'v3.lifescience', 'v3.lifescience.', 'v3..x']) {
      const response = await callback(`code=c-1&state=${state}`)
      expect(response.status).toBe(400)
      expect(response.headers.get('location')).toBeNull()
    }
    await withoutBridge(async () => {
      expect((await callback(`code=c-1&state=v3.lifescience.${keycloakState}`)).status).toBe(400)
    })
    expect(fetchCalls).toHaveLength(0)
  })
})

describe('bridge token', () => {
  test('forwards code exchange with v2 redirect uri', async () => {
    const response = await token('lifescience', {...codeExchange, scope: 'dropped'}, basicAuth)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({access_token: 'at', id_token: 'it'})
    const call = fetchCalls.find(c => c.url === 'https://lifescience.test/token')!
    expect(call.options.headers['Authorization']).toBe(basicAuth.authorization)
    expect(call.options.redirect).toBe('manual')
    expect(Object.fromEntries(call.options.body)).toEqual({...codeExchange, redirect_uri: 'https://web.test/callback'})
  })

  test('accepts client secret post and encoded basic client id', async () => {
    const exchange = {...codeExchange, redirect_uri: broker('iam4nfdi')}
    const post = {...exchange, client_id: 'aruna-engine.org/callback', client_secret: 'nfdi-secret'}
    expect((await token('iam4nfdi', post)).status).toBe(200)
    const call = fetchCalls.find(c => c.url === 'https://iam4nfdi.test/token')!
    expect(call.options.body.get('client_secret')).toBe('nfdi-secret')
    expect(call.options.headers['Authorization']).toBeUndefined()

    const encoded = {authorization: 'Basic ' + btoa('aruna-engine.org%2Fcallback:nfdi-secret')}
    expect((await token('iam4nfdi', exchange, encoded)).status).toBe(200)
  })

  test('passes provider errors through', async () => {
    replyWith(url => url.endsWith('/token')
      ? Response.json({error: 'invalid_grant'}, {status: 400})
      : idpMetadata(url))
    const response = await token('lifescience', codeExchange, basicAuth)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({error: 'invalid_grant'})
  })

  test('rejects invalid requests without forwarding', async () => {
    const cases: [Record<string, string> | string, Record<string, string>, number, string][] = [
      [{...codeExchange, grant_type: 'refresh_token', refresh_token: 'r'}, basicAuth, 400, 'unsupported_grant_type'],
      [{...codeExchange, redirect_uri: 'https://evil.test/cb'}, basicAuth, 400, 'invalid_request'],
      [{...codeExchange, code: ''}, basicAuth, 400, 'invalid_request'],
      [`${new URLSearchParams(codeExchange)}&code=c-2`, basicAuth, 400, 'invalid_request'],
      [codeExchange, {}, 401, 'invalid_client'],
      [codeExchange, {authorization: 'Basic ' + btoa('other:secret')}, 401, 'invalid_client'],
      [codeExchange, {authorization: 'Bearer ls-client'}, 401, 'invalid_client'],
      [{...codeExchange, client_id: 'other'}, basicAuth, 401, 'invalid_client'],
    ]
    for (const [params, headers, status, error] of cases) {
      const response = await token('lifescience', params, headers)
      expect(response.status).toBe(status)
      expect(await response.json()).toEqual({error})
    }
    expect(fetchCalls).toHaveLength(0)
  })

  test('unknown provider or disabled bridge is not found', async () => {
    expect((await token('local', {...codeExchange, redirect_uri: broker('local')}, basicAuth)).status).toBe(404)
    await withoutBridge(async () => {
      expect((await token('lifescience', codeExchange, basicAuth)).status).toBe(404)
    })
  })
})

test('full bridge login returns keycloak state intact', async () => {
  const start = await authorize('lifescience', lifescienceAuth)
  const sent = new URL(start.headers.get('location')!).searchParams
  const back = await callback(`code=c-9&state=${encodeURIComponent(sent.get('state')!)}`)
  const forwarded = new URL(back.headers.get('location')!)
  expect(forwarded.searchParams.get('state')).toBe(keycloakState)
  const exchange = {...codeExchange, code: forwarded.searchParams.get('code')!}
  expect((await token('lifescience', exchange, basicAuth)).status).toBe(200)
})
