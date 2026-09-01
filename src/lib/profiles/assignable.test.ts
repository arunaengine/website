import { describe, expect, it } from 'vitest'
import { GROUP_SCOPED_PROFILES, isAssignableProfile, profileScope } from './assignable'
import type { MetadataProfile } from '@/data/types'

function profile(overrides: Partial<MetadataProfile> = {}): MetadataProfile {
  return {
    id: 'example',
    name: 'Example profile',
    shortName: 'Example',
    description: '',
    domain: 'RO-Crate Profile',
    iconColor: '#335DC6',
    entityRules: [],
    propertyRules: [],
    suggestedKeywords: [],
    managed: false,
    ...overrides,
  }
}

describe('profile assignability', () => {
  it('accepts public and bundled profiles for any group', () => {
    expect(isAssignableProfile(profile({ managed: true }), 'group-1')).toBe(true)
    expect(isAssignableProfile(profile({ builtIn: true }), undefined)).toBe(true)
  })

  it('accepts a group profile only while the node resolves one', () => {
    // The node still requires a public profile, so the group rule stays off.
    const own = profile({ groupId: 'group-1' })

    expect(isAssignableProfile(own, 'group-1')).toBe(GROUP_SCOPED_PROFILES)
    expect(isAssignableProfile(own, 'group-2')).toBe(false)
    expect(isAssignableProfile(own, undefined)).toBe(false)
  })

  it('names the reach of every profile', () => {
    expect(profileScope(profile({ managed: true }))).toBe('Public')
    expect(profileScope(profile({ builtIn: true }))).toBe('Built-in')
    expect(profileScope(profile())).toBe('Group only')
  })
})
