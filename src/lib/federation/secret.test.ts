import { describe, expect, it } from 'vitest'
import { toBase64Url, toHex } from './descriptor'
import { linkNonce, newSecret, tokenSessionId, tokenVia } from './secret'

async function sha256(bytes: Uint8Array<ArrayBuffer>) {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
}

describe('federation secrets', () => {
  it('makes the nonce from the secret bytes', async () => {
    const { secret, nonce } = await newSecret()
    expect(secret).toMatch(/^[0-9a-f]{64}$/)
    const bytes = Uint8Array.from(secret.match(/../g)!, (pair) => parseInt(pair, 16))
    expect(nonce).toBe(await sha256(bytes))
  })

  it('binds a link nonce to the session id', async () => {
    const secret = '01'.repeat(32)
    const expected = await sha256(
      Uint8Array.from([
        ...new TextEncoder().encode('aruna-link-attempt-v1'), 0,
        ...new TextEncoder().encode('SID1'), 0,
        ...Array(32).fill(1),
      ]),
    )
    expect(await linkNonce('SID1', secret)).toBe(expected)
    expect(await linkNonce('SID2', secret)).not.toBe(expected)
  })

  it('reads the session id claim', () => {
    const body = toBase64Url(new TextEncoder().encode(JSON.stringify({ sid: 'S1' })))
    expect(tokenSessionId(`h.${body}.s`)).toBe('S1')
    expect(tokenSessionId('opaque')).toBeNull()
  })

  it('reads the via claim of a linked session only', () => {
    const body = (claims: object) => `h.${toBase64Url(new TextEncoder().encode(JSON.stringify(claims)))}.s`
    expect(tokenVia(body({ sid: 'S1', via: '01JFOREIGN@realm-a' }))).toBe('01JFOREIGN@realm-a')
    expect(tokenVia(body({ sid: 'S1' }))).toBeNull()
    expect(tokenVia(body({ via: 7 }))).toBeNull()
    expect(tokenVia(`h.${toBase64Url(new TextEncoder().encode('null'))}.s`)).toBeNull()
    expect(tokenVia('opaque')).toBeNull()
  })
})
