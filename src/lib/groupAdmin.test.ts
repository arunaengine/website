import { describe, expect, it } from 'vitest'
import { ownRolesWrite } from './groupAdmin'

describe('own role grants', () => {
  const role = (permissions: Record<string, string>) => ({ role_id: 'r', name: 'r', permissions })

  it('matches exact and wildcard write grants only', () => {
    expect(ownRolesWrite([role({ '/realm/g/g1/admin': 'WRITE' })], '/realm/g/g1/admin')).toBe(true)
    expect(ownRolesWrite([role({ '/realm/g/g1/**': 'Write' })], '/realm/g/g1/admin')).toBe(true)
    expect(ownRolesWrite([role({ '/realm/g/g1/**': 'Read' })], '/realm/g/g1/admin')).toBe(false)
    expect(ownRolesWrite([role({ '/realm/g/g2/**': 'Write' })], '/realm/g/g1/admin')).toBe(false)
  })
})
