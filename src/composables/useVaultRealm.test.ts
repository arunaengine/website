import { beforeEach, describe, expect, it } from 'vitest'
import { toBase64Url } from '@/lib/federation/descriptor'
import type { RealmInfoResponse, UserInfoResponse } from '@/lib/api'
import { authToken, federationName, realmInfo, userInfo } from './aruna/state'
import { vaultRealmNote } from './useVaultRealm'

const SERVING = 'RealmBServingAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const ULID = '01JUSERAAAAAAAAAAAAAAAAAAA'

function token(claims: object): string {
  return `h.${toBase64Url(new TextEncoder().encode(JSON.stringify(claims)))}.s`
}

function signIn(userId: string, bearer: string) {
  realmInfo.value = { realm_id: SERVING, description: 'Reef realm', oidc_providers: [] } as unknown as RealmInfoResponse
  userInfo.value = {
    user: { user_id: userId, name: 'Ada', subject_ids: [], attributes: {} },
    realm: { realm_id: SERVING, roles: [] },
  } as unknown as UserInfoResponse
  authToken.value = bearer
}

beforeEach(() => {
  federationName.value = ''
  realmInfo.value = null
  userInfo.value = null
  authToken.value = ''
})

describe('vault realm note', () => {
  it('names the serving realm for a foreign login, not its home realm', () => {
    signIn(`${ULID}@RealmAHomeAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`, token({ sid: 'S1' }))

    expect(vaultRealmNote('unlock')).toBe(
      `Unlock your vault in Reef realm (${SERVING}). Enter your Reef realm vault passphrase.`,
    )
    expect(vaultRealmNote('create')).toBe(`Create your vault in Reef realm (${SERVING}). Choose a Reef realm vault passphrase.`)
    expect(vaultRealmNote('change')).toBe(`Change the passphrase of your vault in Reef realm (${SERVING}).`)
  })

  it('calls the vault of a linked session the local account vault', () => {
    signIn(ULID, token({ sid: 'S1', via: `${ULID}@RealmAHomeAAAAAAAAAAAAAAAAAAAAAAAAAAAAA` }))

    expect(vaultRealmNote('unlock')).toBe(`Unlock the local account vault in Reef realm (${SERVING}).`)
    expect(vaultRealmNote('create')).toContain('A linked login opens the same vault.')
    expect(vaultRealmNote('change')).toContain('local account vault')
  })

  it('adds nothing for a local login, also when the id text equals a foreign one', () => {
    signIn(ULID, token({ sid: 'S1' }))
    expect(vaultRealmNote('unlock')).toBeNull()

    signIn(`${ULID}@${SERVING}`, token({ sid: 'S1' }))
    expect(vaultRealmNote('unlock')).toBeNull()
  })

  it('uses the federation name when the realm has one', () => {
    federationName.value = 'Reef federation'
    signIn(`${ULID}@RealmAHomeAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`, token({ sid: 'S1' }))

    expect(vaultRealmNote('unlock')).toContain(`vault in Reef federation (${SERVING})`)
  })
})
