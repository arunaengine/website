import {afterEach, beforeEach, describe, expect, setSystemTime, test} from 'bun:test'
import {createHash} from 'node:crypto'
import {createHandler, fetchCalls, idpMetadata, replyWith} from './harness'
import {nativeCallback, portalCallback, verifierMatches} from '../server/utils/oidc'

const handler = await createHandler()
const loopback = 'http://127.0.0.1:53682/auth/callback'
const verifier = 'native-verifier-'.padEnd(64, 'y')
const challenge = createHash('sha256').update(verifier).digest('base64url')
const nfdiAuth = {
  client_id: 'aruna-engine.org/callback',
  redirect_uri: loopback,
  response_type: 'code',
  scope: 'openid profile email',
  state: 'desktop.app-state',
  code_challenge: challenge,
  code_challenge_method: 'S256',
}

beforeEach(() => replyWith(url => {
  if (url.endsWith('/.well-known/openid-configuration')) return idpMetadata(url)
  if (url.endsWith('/token')) return {access_token: 'at', id_token: 'it', expires_in: 60}
  throw new Error(`unexpected fetch ${url}`)
}))
afterEach(() => setSystemTime())

function authorize(provider: string, params: Record<string, string>) {
  return handler(new Request(`https://web.test/v3-bridge/${provider}/authorize?${new URLSearchParams(params)}`))
}

// Runs authorize and the v2 callback; answers where the browser is sent back to
async function issueCode(params: Record<string, string>, code: string, provider = 'iam4nfdi') {
  const start = await authorize(provider, params)
  expect(start.status).toBe(302)
  const state = new URL(start.headers.get('location')!).searchParams.get('state')!
  const back = await handler(new Request(`https://web.test/callback?code=${code}&state=${encodeURIComponent(state)}`))
  expect(back.status).toBe(302)
  return back.headers.get('location')!
}

// The bridge code the client got back
const codeOf = (location: string) => new URL(location).searchParams.get('code')!

function token(params: Record<string, string>, provider = 'iam4nfdi') {
  return handler(new Request(`https://web.test/v3-bridge/${provider}/token`, {
    method: 'POST',
    headers: {'content-type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams(params).toString(),
  }))
}

const exchange = (code: string, extra: Record<string, string> = {}) => ({
  grant_type: 'authorization_code', code, redirect_uri: loopback, code_verifier: verifier,
  client_id: 'aruna-engine.org/callback', ...extra,
})

test('native callback rule', () => {
  for (const url of [
    loopback,
    'http://127.0.0.1:1/auth/callback',
    'http://127.0.0.1/auth/callback',
    'http://[::1]:8080/auth/callback',
    'aruna://auth/callback',
  ]) {
    expect(nativeCallback(url)).toBe(true)
    expect(portalCallback(url)).toBe(true)
  }
  for (const url of [
    'https://127.0.0.1:8080/auth/callback',
    'http://localhost:8080/auth/callback',
    'http://127.0.0.2:8080/auth/callback',
    'http://127.1:8080/auth/callback',
    'http://127.0.0.1.:8080/auth/callback',
    'http://[0:0::1]:8080/auth/callback',
    'http://[::ffff:127.0.0.1]:8080/auth/callback',
    'http://0.0.0.0:8080/auth/callback',
    'http://127.0.0.1:080/auth/callback',
    'http://127.0.0.1:80/auth/callback',
    'http://user@127.0.0.1:8080/auth/callback',
    'http://127.0.0.1:8080/auth/callback?',
    'http://127.0.0.1:8080/auth/callback?x=1',
    'http://127.0.0.1:8080/auth/callback#x',
    'http://127.0.0.1:8080/auth/callback/',
    'http://127.0.0.1:8080/other',
    'http://127.0.0.1:8080.evil.com/auth/callback',
    'aruna://auth/callback?x=1',
    'aruna://auth/callback#x',
    'aruna://auth/other',
    'aruna:auth/callback',
    'ARUNA://auth/callback',
    'other://auth/callback',
    undefined,
  ]) {
    expect(nativeCallback(url)).toBe(false)
    expect(portalCallback(url)).toBe(false)
  }
})

describe('native authorize and callback', () => {
  test('sends the code back to a loopback or scheme callback', async () => {
    const location = await issueCode(nfdiAuth, 'n-1')
    const back = new URL(location)
    expect(back.origin + back.pathname).toBe(loopback)
    expect(Object.fromEntries(back.searchParams)).toEqual({code: codeOf(location), state: 'desktop.app-state'})
    expect(location).not.toContain('n-1')

    const v6 = 'http://[::1]:9000/auth/callback'
    expect((await issueCode({...nfdiAuth, redirect_uri: v6}, 'n-2')).startsWith(`${v6}?`)).toBe(true)
    const scheme = await issueCode({...nfdiAuth, redirect_uri: 'aruna://auth/callback'}, 'n-3')
    expect(scheme).toBe(`aruna://auth/callback?state=desktop.app-state&code=${codeOf(scheme)}`)
  })

  test('rejects bad native requests', async () => {
    for (const params of [
      {...nfdiAuth, redirect_uri: 'http://localhost:53682/auth/callback'},
      {...nfdiAuth, redirect_uri: `${loopback}?x=1`},
      {...nfdiAuth, redirect_uri: 'aruna://auth/other'},
      {...nfdiAuth, code_challenge: ''},
      {...nfdiAuth, code_challenge: 'too-short'},
      {...nfdiAuth, code_challenge_method: 'plain'},
    ]) {
      const response = await authorize('iam4nfdi', params)
      expect(response.status).toBe(400)
      expect(response.headers.get('location')).toBeNull()
    }
  })
})

describe('bridge pkce', () => {
  test('redeems a bound code once with the right verifier', async () => {
    const code1 = codeOf(await issueCode(nfdiAuth, 'p-1'))
    const response = await token(exchange(code1))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({id_token: 'it', token_type: 'Bearer', expires_in: 60})
    // The upstream has no PKCE, so no verifier goes there
    const call = fetchCalls.find(c => c.url === 'https://iam4nfdi.test/token')!
    expect(call.options.body.get('code')).toBe('p-1')
    expect(call.options.body.get('code_verifier')).toBeNull()

    const again = await token(exchange(code1))
    expect(again.status).toBe(400)
    expect(await again.json()).toEqual({error: 'invalid_grant'})
  })

  test('refuses a wrong, short or missing verifier', async () => {
    const code2 = codeOf(await issueCode(nfdiAuth, 'p-2'))
    const wrong = await token(exchange(code2, {code_verifier: 'other-verifier-'.padEnd(64, 'z')}))
    expect(wrong.status).toBe(400)
    expect(await wrong.json()).toEqual({error: 'invalid_grant'})
    // A failed attempt uses the code up
    expect((await token(exchange(code2))).status).toBe(400)

    const code3 = codeOf(await issueCode(nfdiAuth, 'p-3'))
    const missing = await token(exchange(code3, {code_verifier: ''}))
    expect(missing.status).toBe(400)
    expect(await missing.json()).toEqual({error: 'invalid_request'})
    expect(verifierMatches('short', challenge)).toBe(false)
    expect(fetchCalls.filter(c => c.url.endsWith('/token'))).toHaveLength(0)
  })

  test('refuses unknown codes, other callbacks and other providers', async () => {
    expect((await token(exchange('never-issued'))).status).toBe(400)

    const code4 = codeOf(await issueCode(nfdiAuth, 'p-4'))
    expect((await token(exchange(code4, {redirect_uri: 'http://127.0.0.1:1/auth/callback'}))).status).toBe(400)

    const code5 = codeOf(await issueCode(nfdiAuth, 'p-5'))
    const other = await token(exchange(code5, {client_id: 'ls-client'}), 'lifescience')
    expect(other.status).toBe(400)
    expect(await other.json()).toEqual({error: 'invalid_grant'})
    expect(fetchCalls.filter(c => c.url.endsWith('/token'))).toHaveLength(0)
  })

  test('refuses a code after five minutes', async () => {
    const start = Date.now()
    setSystemTime(start)
    const code6 = codeOf(await issueCode(nfdiAuth, 'p-6'))
    const code7 = codeOf(await issueCode(nfdiAuth, 'p-7'))
    setSystemTime(start + 5 * 60 * 1000 - 1)
    expect((await token(exchange(code6))).status).toBe(200)
    setSystemTime(start + 5 * 60 * 1000)
    const expired = await token(exchange(code7))
    expect(expired.status).toBe(400)
    expect(await expired.json()).toEqual({error: 'invalid_grant'})
  })

  test('binds lifescience codes too and forwards the verifier upstream', async () => {
    const code8 = codeOf(await issueCode({...nfdiAuth, client_id: 'ls-client'}, 'p-8', 'lifescience'))
    const response = await token(exchange(code8, {client_id: 'ls-client'}), 'lifescience')
    expect(response.status).toBe(200)
    const call = fetchCalls.find(c => c.url === 'https://lifescience.test/token')!
    expect(call.options.body.get('code')).toBe('p-8')
    expect(call.options.body.get('code_verifier')).toBe(verifier)
  })

  test('works for every bridged provider', async () => {
    for (const [provider, client_id] of [['lifescience', 'ls-client'], ['iam4nfdi', 'aruna-engine.org/callback'], ['gfbio', 'gfbio-client']]) {
      for (const redirect_uri of [loopback, 'aruna://auth/callback', 'https://v3-debug.aruna-engine.org/auth/callback']) {
        const upstream = `all-${provider}-${redirect_uri}`
        const location = await issueCode({...nfdiAuth, client_id, redirect_uri}, encodeURIComponent(upstream), provider)
        expect(codeOf(location)).toMatch(/^[\w-]{43}$/)
        expect(decodeURIComponent(location)).not.toContain(upstream)
        const response = await token(exchange(codeOf(location), {client_id, redirect_uri}), provider)
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({id_token: 'it', token_type: 'Bearer', expires_in: 60})
        expect(fetchCalls.at(-1)!.options.body.get('code')).toBe(upstream)
      }
    }
  })
})

describe('intercepted callback', () => {
  const attackerVerifier = 'attacker-verifier-'.padEnd(64, 'q')
  const attackerChallenge = createHash('sha256').update(attackerVerifier).digest('base64url')
  const attacker = {...nfdiAuth, redirect_uri: 'http://127.0.0.1:4444/auth/callback', code_challenge: attackerChallenge}

  // The attacker starts its own authorize request to get a wrapped state with its own challenge and callback
  async function forgedState() {
    const start = await authorize('iam4nfdi', attacker)
    return new URL(start.headers.get('location')!).searchParams.get('state')!
  }

  function replay(code: string, state: string) {
    return handler(new Request(`https://web.test/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`))
  }

  for (const provider of ['iam4nfdi', 'gfbio']) {
    const client_id = provider === 'gfbio' ? 'gfbio-client' : 'aruna-engine.org/callback'

    test(`a replayed bridge or upstream code gives the attacker no token (${provider})`, async () => {
      const upstream = `victim-${provider}`
      const victim = codeOf(await issueCode({...nfdiAuth, client_id}, upstream, provider))
      const state = await forgedState()

      // The upstream code was bound once; a second binding is refused
      const again = await replay(upstream, state)
      expect(again.status).toBe(400)
      expect(again.headers.get('location')).toBeNull()

      // The intercepted bridge code gets a new binding, but redeems no upstream code
      const relayed = await replay(victim, state)
      expect(relayed.status).toBe(302)
      replyWith(url => {
        if (url.endsWith('/.well-known/openid-configuration')) return idpMetadata(url)
        const body = fetchCalls.at(-1)!.options.body
        return body.get('code') === upstream ? {id_token: 'victim-token'} : Response.json({error: 'invalid_grant'}, {status: 400})
      })
      const stolen = await token({
        ...exchange(codeOf(relayed.headers.get('location')!), {client_id}),
        redirect_uri: attacker.redirect_uri, code_verifier: attackerVerifier,
      }, provider)
      expect(stolen.status).toBe(400)
      expect(JSON.stringify(await stolen.json())).not.toContain('victim-token')

      // Nor does the attacker's verifier redeem the intercepted bridge code itself
      const direct = await token({...exchange(victim, {client_id}), code_verifier: attackerVerifier}, provider)
      expect(direct.status).toBe(400)
      expect(await direct.json()).toEqual({error: 'invalid_grant'})
    })
  }
})

test('discovery names the bridge endpoints for native apps', async () => {
  const response = await handler(new Request('https://web.test/v3-bridge/iam4nfdi/.well-known/openid-configuration'))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    authorization_endpoint: 'https://web.test/v3-bridge/iam4nfdi/authorize',
    token_endpoint: 'https://web.test/v3-bridge/iam4nfdi/token',
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
  })
  expect((await handler(new Request('https://web.test/v3-bridge/local/.well-known/openid-configuration'))).status).toBe(404)
})
