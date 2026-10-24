import { describe, expect, it } from 'vitest'
import { parseEnrollInput, withSite } from './enrollLink'

const LINK = 'aruna://enroll?secret=ab%2Bcd%2Fef%3D&seed=https%3A%2F%2Fnode.test&realm=R1'

describe('parseEnrollInput', () => {
  it('decodes the deep link the portal mints', () => {
    expect(parseEnrollInput(` ${LINK} `)).toEqual({
      secret: 'ab+cd/ef=',
      seedUrl: 'https://node.test',
      realm: 'R1',
    })
  })

  it('keeps a link without seed or realm', () => {
    expect(parseEnrollInput('aruna://enroll?secret=S3CRET-VALUE')).toEqual({ secret: 'S3CRET-VALUE' })
  })

  it('takes a bare pasted code', () => {
    expect(parseEnrollInput('S3CRET-VALUE')).toEqual({ secret: 'S3CRET-VALUE' })
  })

  it('refuses a link that is not an enrollment', () => {
    // Another aruna:// route must never be redeemed as a secret.
    expect(parseEnrollInput('aruna://auth/callback?code=x')).toBeNull()
    expect(parseEnrollInput('https://portal.test/enroll?secret=S3CRET-VALUE')).toBeNull()
  })

  it('refuses an enrollment link without a secret', () => {
    expect(parseEnrollInput('aruna://enroll?seed=https%3A%2F%2Fnode.test')).toBeNull()
  })

  it('refuses whitespace, empties and stubs', () => {
    expect(parseEnrollInput('   ')).toBeNull()
    expect(parseEnrollInput('short')).toBeNull()
    expect(parseEnrollInput('two words here')).toBeNull()
  })
})

describe('withSite', () => {
  const SITE = 'https://v3.aruna-engine.org'

  it('adds the website after the node fields, which stay as minted', () => {
    expect(withSite(LINK, SITE)).toBe(`${LINK}&site=https%3A%2F%2Fv3.aruna-engine.org`)
    expect(parseEnrollInput(withSite(LINK, SITE))).toEqual(parseEnrollInput(LINK))
  })

  it('leaves a link that already names its site', () => {
    const named = `${LINK}&site=https%3A%2F%2Fother.test`
    expect(withSite(named, SITE)).toBe(named)
  })
})
