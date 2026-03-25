import { describe, expect, it } from "vitest"
import { parseJwt } from '~/server/utils/jwt'

describe('server/utils/jwt', () => {
  it('parses a JWT payload', () => {
    const payload = { iss: 'issuer', exp: 123456 }
    const token = `header.${Buffer.from(JSON.stringify(payload)).toString('base64')}.signature`

    expect(parseJwt(token)).toEqual(payload)
  })

  it('throws on malformed tokens', () => {
    expect(() => parseJwt('not-a-jwt')).toThrow()
  })
})
