import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type UserInfoResponse } from '@/lib/api'

const popupSignIn = vi.fn()
const refresh = vi.fn(async () => undefined)
const replaceToken = vi.fn()

vi.mock('./popupSignIn', () => ({
  popupSignIn: (...args: unknown[]) => popupSignIn(...args),
  cancelPopup: vi.fn(),
  SignInCancelled: class extends Error {},
}))
vi.mock('./aruna/session', () => ({ refresh: () => refresh(), replaceToken: (token: string) => replaceToken(token) }))

const { authToken, apiBaseUrl, sessionEpoch, userInfo } = await import('./aruna/state')
const { mergeFailure, useAccountMerge } = await import('./useAccountMerge')

const BASE = 'https://api.test'
const MISSING = { error: 'no account is registered for this sign-in', code: 'account_missing' }
const A = 'a1@R'
const B = 'b1@R'

function jwt(claims: Record<string, unknown>): string {
  const now = Math.floor(Date.now() / 1000)
  const body = { iat: now, exp: now + 600, ...claims }
  return `h.${btoa(JSON.stringify(body)).replace(/=+$/, '')}.s`
}

const ageSecs = (secs: number) => Math.floor(Date.now() / 1000) - secs
const OWN_FRESH = jwt({ sub: A, auth_time: ageSecs(30) })
const OWN_STALE = jwt({ sub: A, auth_time: ageSecs(3600) })
const OIDC_B = jwt({ sub: 'kc-b', auth_time: ageSecs(5) })
const TOKEN_B = jwt({ sub: B, auth_time: ageSecs(5) })

function info(userId: string, name: string): UserInfoResponse {
  return {
    user: { user_id: userId, name, subject_ids: ['s1', 's2'], attributes: {} },
    realm: { realm_id: 'R', roles: [{ role_id: 'r1', name: 'reader', permissions: {} }] },
    groups: [{ group_id: 'g1', display_name: 'Lab', roles: [] }],
    preferences: { favourite_metadata_ids: [] },
  }
}

interface Call {
  method: string
  path: string
  bearer: string
  body: unknown
}

type Answer = Response | ((call: Call) => Response | undefined)

function json(body: unknown, status = 200): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let calls: Call[]
let answers: Map<string, Answer>
let vaults: Record<string, Array<{ revision: string; predecessors: string[]; payload: string; updated_at: string }>>
let keys: Record<string, Array<{ record_id: string; key_id: string; public_key: string; has_recovery: boolean }>>

function answer(method: string, path: string, reply: Answer) {
  answers.set(`${method} ${path}`, reply)
}

beforeEach(() => {
  calls = []
  answers = new Map()
  vaults = { [OWN_FRESH]: [], [TOKEN_B]: [] }
  keys = { [A]: [], [B]: [] }
  apiBaseUrl.value = BASE
  authToken.value = OWN_FRESH
  userInfo.value = info(A, 'Alice')
  popupSignIn.mockReset()
  popupSignIn.mockResolvedValue({ access_token: 'x', id_token: OIDC_B, token_type: 'Bearer' })
  refresh.mockClear()
  replaceToken.mockClear()
  answer('GET', '/access/token', ({ bearer }) => (bearer === OIDC_B ? json({ token: TOKEN_B }) : undefined))
  answer('GET', '/access/users/me', json(info(B, 'Bob')))
  answer('GET', '/access/users/me/devices', json({ devices: [{ id: 'd1' }] }))
  vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    const bearer = new Headers(init?.headers).get('Authorization')?.replace('Bearer ', '') ?? ''
    const call = { method, path: url.pathname, bearer, body: init?.body ? JSON.parse(String(init.body)) : undefined }
    calls.push(call)
    if (call.path === '/access/users/me/vault') {
      const heads = (vaults[bearer] ??= [])
      if (method === 'GET') return json({ heads })
      if (method === 'DELETE') {
        vaults[bearer] = []
        return json(undefined, 204)
      }
      const { payload } = call.body as { payload: string }
      heads.push({ revision: 'r9', predecessors: [], payload, updated_at: 'now' })
      return json({ heads })
    }
    if (call.path === '/access/users/me/keys' && method === 'POST' && !answers.has('POST /access/users/me/keys')) {
      const record = { record_id: 'k9', ...(call.body as { key_id: string; public_key: string; has_recovery: boolean }) }
      keys[A].unshift(record)
      return json(record, 201)
    }
    const listed = /^\/access\/users\/(.+)\/keys$/.exec(call.path)
    if (listed && method === 'GET') return json({ keys: keys[decodeURIComponent(listed[1])] ?? [] })
    const reply = answers.get(`${method} ${url.pathname}`)
    const response = typeof reply === 'function' ? reply(call) : reply?.clone()
    return response ?? json({ error: 'unexpected' }, 500)
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function requests(method: string, path: string): Call[] {
  return calls.filter((call) => call.method === method && call.path === path)
}

async function confirmed() {
  const merge = useAccountMerge()
  await merge.start()
  expect(merge.step.value).toBe('confirm')
  return merge
}

describe('account merge', () => {
  it('reads the other account, then merges it into this one', async () => {
    const merge = await confirmed()
    expect(merge.other.value?.info.user.name).toBe('Bob')
    expect(merge.other.value?.devices).toBe(1)
    expect(requests('GET', '/access/users/me')[0].bearer).toBe(TOKEN_B)
    answer('POST', '/access/users/me/merge', json({
      user_id: A, merged_user_id: B, subjects: 2, groups: 1, realm_roles: 0, devices: 1,
      attributes: 2, attributes_not_copied: ['theme'], secondaries: 0, repeated: false,
    }))

    await merge.merge()

    const [sent] = requests('POST', '/access/users/me/merge')
    expect(sent.bearer).toBe(OWN_FRESH)
    expect(sent.body).toEqual({ token: TOKEN_B })
    expect(merge.step.value).toBe('merged')
    expect(merge.result.value?.attributes_not_copied).toEqual(['theme'])
    expect(popupSignIn).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalled()
  })

  it('signs in again first when this login is older than 5 minutes', async () => {
    authToken.value = OWN_STALE
    const merge = await confirmed()
    const ownOidc = jwt({ sub: 'kc-a', auth_time: ageSecs(1) })
    const renewed = jwt({ sub: A, auth_time: ageSecs(1) })
    popupSignIn.mockResolvedValueOnce({ access_token: 'x', id_token: ownOidc, token_type: 'Bearer' })
    answer('GET', '/access/token', ({ bearer }) => json({ token: bearer === ownOidc ? renewed : TOKEN_B }))
    answer('POST', '/access/users/me/merge', json({ user_id: A, merged_user_id: B, attributes_not_copied: [] }))

    await merge.merge()

    expect(popupSignIn).toHaveBeenCalledTimes(2)
    expect(requests('POST', '/access/users/me/merge')[0].bearer).toBe(renewed)
    expect(replaceToken).toHaveBeenCalledWith(renewed)
    expect(merge.step.value).toBe('merged')
  })

  it('signs in with the chosen logins and merges with the upstream sign-in', async () => {
    authToken.value = OWN_STALE
    const upstream = (provider: string) => ({ name: provider, description: '', logo: '', params: {}, linkParams: {}, upstream: { provider, bridge: `https://bridge.test/${provider}` } })
    const merge = useAccountMerge()
    merge.choose()
    expect(merge.step.value).toBe('choose')
    await merge.start(upstream('gfbio'))
    expect(popupSignIn).toHaveBeenLastCalledWith(upstream('gfbio'))
    expect(requests('GET', '/access/token')[0].bearer).toBe(OIDC_B)
    expect(merge.step.value).toBe('confirm')
    const ownOidc = jwt({ sub: 'ls-a', auth_time: ageSecs(1) })
    const renewed = jwt({ sub: A, auth_time: ageSecs(1) })
    popupSignIn.mockResolvedValueOnce({ id_token: ownOidc, token_type: 'Bearer' })
    answer('GET', '/access/token', ({ bearer }) => json({ token: bearer === ownOidc ? renewed : TOKEN_B }))
    answer('POST', '/access/users/me/merge', json({ user_id: A, merged_user_id: B, attributes_not_copied: [] }))

    await merge.merge(upstream('lifescience'))

    expect(popupSignIn).toHaveBeenLastCalledWith(upstream('lifescience'))
    const [sent] = requests('POST', '/access/users/me/merge')
    expect(sent.bearer).toBe(renewed)
    expect(sent.body).toEqual({ token: TOKEN_B })
    expect(merge.step.value).toBe('merged')
  })

  it('returns to the login choice when a chosen sign-in fails', async () => {
    popupSignIn.mockRejectedValueOnce(new Error('Sign-in was rejected (access_denied).'))
    const merge = useAccountMerge()
    await merge.start({ name: 'GFBio SSO', description: '', logo: '', params: {}, linkParams: {} })
    expect(merge.step.value).toBe('choose')
    expect(merge.failure.value).toContain('access_denied')
  })

  it('refuses a new login of another account than this one', async () => {
    authToken.value = OWN_STALE
    const merge = await confirmed()
    answer('GET', '/access/token', json({ token: jwt({ sub: 'c1@R', auth_time: ageSecs(1) }) }))

    await merge.merge()

    expect(requests('POST', '/access/users/me/merge')).toEqual([])
    expect(replaceToken).not.toHaveBeenCalled()
    expect(merge.step.value).toBe('confirm')
    expect(merge.failure.value).toBe('You signed in with another account. Sign in as Alice.')
  })

  it('starts over when the other sign-in got older than 5 minutes', async () => {
    answer('GET', '/access/token', json({ token: jwt({ sub: B, auth_time: ageSecs(400) }) }))
    const merge = await confirmed()

    await merge.merge()

    expect(requests('POST', '/access/users/me/merge')).toEqual([])
    expect(merge.step.value).toBe('idle')
    expect(merge.failure.value).toBe('The other sign-in is older than 5 minutes. Start again.')
  })

  it.each([
    [409, { error: 'the role no-secret of the other account denies part of it', code: 'role_conflict' },
      'The role "no-secret" of that account would cut your own access. Remove it there first.'],
    [503, { error: 'this node does not coordinate account merges; retry the request' },
      'Merging is not available right now. Try again later.'],
    [503, { error: 'this node does not run merges', code: 'not_coordinator' },
      'This node does not handle account merges right now. Try again in a moment.'],
    [503, { error: 'no management node was reachable', code: 'no_management_node' },
      'This node does not handle account merges right now. Try again in a moment.'],
    [409, { error: 'the other account holds a vault that differs', code: 'vault_present' },
      'The vaults of the two accounts differ. Merge the vaults first.'],
    [403, { error: 'service accounts are never merged', code: 'merge_refused' },
      'Merge refused: service accounts are never merged.'],
  ])('keeps the confirmation and explains a %i refusal', async (status, body, message) => {
    const merge = await confirmed()
    answer('POST', '/access/users/me/merge', json(body, status))

    await merge.merge()

    expect(merge.step.value).toBe('confirm')
    expect(merge.failure.value).toBe(message)
  })

  it('reloads the profile before it shows that a merge answer was lost', async () => {
    const merge = await confirmed()
    answer('POST', '/access/users/me/merge', json({ error: 'Bad gateway', code: 'relay_failed' }, 502))
    refresh.mockClear()
    let shown: string | null = 'unset'
    refresh.mockImplementationOnce(async () => {
      shown = merge.failure.value
    })

    await merge.merge()

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(shown).toBeNull()
    expect(merge.step.value).toBe('confirm')
    expect(merge.failure.value).toBe(
      'The answer was lost, so it may have worked. Your account was reloaded. Check it, then try again if needed.',
    )
  })

  it('names the coordinator and reloads for a lost answer when attaching', async () => {
    answer('GET', '/access/token', json(MISSING, 401))
    const merge = useAccountMerge()
    await merge.start()
    answer('POST', '/access/users/me/subjects', json({ error: 'not run here', code: 'not_coordinator' }, 503))

    await merge.attach()

    expect(merge.step.value).toBe('unregistered')
    expect(merge.failure.value).toBe('This node does not handle account merges right now. Try again in a moment.')
    expect(refresh).not.toHaveBeenCalled()

    answer('POST', '/access/users/me/subjects', json({ error: 'Bad gateway', code: 'relay_failed' }, 502))
    await merge.attach()

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(merge.step.value).toBe('unregistered')
    expect(merge.failure.value).toContain('The answer was lost')
  })

  it('stops at the account this session belongs to', async () => {
    answer('GET', '/access/users/me', json(info(A, 'Alice')))
    const merge = useAccountMerge()
    await merge.start()
    expect(merge.step.value).toBe('idle')
    expect(merge.failure.value).toBe('This is the account you are signed in with.')
  })

  it('offers to attach a sign-in that has no account yet', async () => {
    answer('GET', '/access/token', json(MISSING, 401))
    answer('POST', '/access/users/me/subjects', json(info(A, 'Alice').user))
    const merge = useAccountMerge()
    await merge.start()
    expect(merge.step.value).toBe('unregistered')
    expect(requests('GET', '/access/users/me')).toEqual([])

    await merge.attach()

    const [sent] = requests('POST', '/access/users/me/subjects')
    expect(sent.bearer).toBe(OWN_FRESH)
    expect(sent.body).toEqual({ token: OIDC_B })
    expect(merge.step.value).toBe('attached')
  })

  it('asks to sign in again when the sign-in is refused, not unregistered', async () => {
    answer('GET', '/access/token', json({ error: 'Unauthorized', code: 'Not authorized' }, 401))
    const merge = useAccountMerge()
    await merge.start()
    expect(merge.step.value).toBe('idle')
    expect(merge.failure.value).toBe('That sign-in was refused. Sign in again.')
    await merge.attach()
    expect(requests('POST', '/access/users/me/subjects')).toEqual([])
  })

  it('offers the merge when the sign-in turns out to have an account', async () => {
    let issued = 0
    answer('GET', '/access/token', () => (issued++ ? json({ token: TOKEN_B }) : json(MISSING, 401)))
    answer('POST', '/access/users/me/subjects', json({ error: 'taken', code: 'subject_taken' }, 409))
    const merge = useAccountMerge()
    await merge.start()

    await merge.attach()

    expect(merge.step.value).toBe('confirm')
    expect(merge.failure.value).toBe('This sign-in has its own account. You can merge it instead.')
  })

  it('copies the sealed vault and the key of the other account, and keeps its vault there', async () => {
    vaults[TOKEN_B] = [{ revision: 'r1', predecessors: [], payload: 'sealed-b', updated_at: 'then' }]
    keys[B] = [{ record_id: 'k1', key_id: 'key-b', public_key: 'pub-b', has_recovery: true }]
    const merge = useAccountMerge()
    await merge.start()
    expect(merge.step.value).toBe('copy-vault')

    await merge.copyVault()

    const [saved] = requests('PUT', '/access/users/me/vault')
    expect(saved.bearer).toBe(OWN_FRESH)
    expect(saved.body).toEqual({ payload: 'sealed-b', predecessors: [] })
    const [published] = requests('POST', '/access/users/me/keys')
    expect(published.bearer).toBe(OWN_FRESH)
    expect(published.body).toEqual({ key_id: 'key-b', public_key: 'pub-b', has_recovery: true })
    expect(requests('DELETE', '/access/users/me/vault')).toEqual([])
    expect(vaults[OWN_FRESH].map((head) => head.payload)).toEqual(['sealed-b'])
    expect(vaults[TOKEN_B].map((head) => head.payload)).toEqual(['sealed-b'])
    expect(merge.step.value).toBe('confirm')
  })

  it('saves every head of the other vault unchanged, never combined', async () => {
    const head = (payload: string) => ({ revision: payload, predecessors: [], updated_at: 'then', payload })
    vaults[TOKEN_B] = [head('b1'), head('b2')]
    const merge = useAccountMerge()
    await merge.start()
    expect(merge.step.value).toBe('copy-vault')

    await merge.copyVault()

    expect(requests('PUT', '/access/users/me/vault').map((call) => call.body)).toEqual([
      { payload: 'b1', predecessors: [] },
      { payload: 'b2', predecessors: [] },
    ])
    expect(requests('POST', '/access/users/me/keys')).toEqual([])
    expect(merge.step.value).toBe('confirm')
  })

  it('saves only what did not arrive when the copy is repeated', async () => {
    const head = (payload: string) => ({ revision: payload, predecessors: [], updated_at: 'then', payload })
    vaults[TOKEN_B] = [head('b1'), head('b2')]
    keys[B] = [{ record_id: 'k1', key_id: 'key-b', public_key: 'pub-b', has_recovery: false }]
    keys[A] = [{ record_id: 'k2', key_id: 'key-b', public_key: 'pub-b', has_recovery: false }]
    vaults[OWN_FRESH] = [head('b1')]
    const merge = useAccountMerge()
    await merge.start()
    expect(merge.step.value).toBe('copy-vault')

    await merge.copyVault()

    expect(requests('PUT', '/access/users/me/vault').map((call) => call.body)).toEqual([{ payload: 'b2', predecessors: [] }])
    expect(requests('POST', '/access/users/me/keys')).toEqual([])
  })

  it('keeps the copy step with the reason when the key is refused', async () => {
    vaults[TOKEN_B] = [{ revision: 'r1', predecessors: [], payload: 'sealed-b', updated_at: 'then' }]
    keys[B] = [{ record_id: 'k1', key_id: 'key-b', public_key: 'pub-b', has_recovery: false }]
    answer('POST', '/access/users/me/keys', json({ error: 'the user has published the most key records allowed' }, 409))
    const merge = useAccountMerge()
    await merge.start()

    await merge.copyVault()

    expect(merge.step.value).toBe('copy-vault')
    expect(merge.failure.value).toBe('the user has published the most key records allowed')
  })

  it('goes straight to the merge when this account holds the other vault unchanged', async () => {
    const head = (payload: string) => ({ revision: payload, predecessors: [], updated_at: 'then', payload })
    vaults[TOKEN_B] = [head('b1')]
    vaults[OWN_FRESH] = [head('mine'), head('b1')]
    const merge = useAccountMerge()
    await merge.start()
    expect(merge.step.value).toBe('confirm')
  })

  it('stops when the two vaults differ', async () => {
    const head = (payload: string) => ({ revision: 'r', predecessors: [], updated_at: 'then', payload })
    vaults[OWN_FRESH] = [head('own')]
    vaults[TOKEN_B] = [head('b')]
    const merge = useAccountMerge()
    await merge.start()
    expect(merge.step.value).toBe('vault-blocked')
    expect(merge.other.value?.ownVault).toBe(true)
    expect(requests('PUT', '/access/users/me/vault')).toEqual([])
  })

  it('drops the other account when the session changes', async () => {
    let release: () => void = () => undefined
    popupSignIn.mockReturnValueOnce(new Promise((resolve) => {
      release = () => resolve({ access_token: 'x', id_token: OIDC_B, token_type: 'Bearer' })
    }))
    const merge = useAccountMerge()
    const started = merge.start()
    sessionEpoch.value++
    release()
    await started
    expect(merge.step.value).toBe('idle')
    expect(merge.other.value).toBeNull()
    expect(requests('GET', '/access/token')).toEqual([])
  })

  it('names the waiting time and the rate limit', () => {
    expect(mergeFailure(new ApiError(429, 'slow down'))).toBe('Too many attempts. Wait a minute.')
    expect(mergeFailure(new ApiError(404, 'Not found'))).toBe(
      'This node does not know one of the accounts yet. Try again later.',
    )
  })
})
