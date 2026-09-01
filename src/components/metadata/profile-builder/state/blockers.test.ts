import { describe, expect, it } from 'vitest'
import { profileBlockers } from './blockers'

const READY = {
  errors: [] as string[],
  duplicateName: '',
  isPublic: false,
  hasEndpoint: true,
  hasKey: true,
  publishing: false,
}

describe('profile creation blockers', () => {
  it('lists nothing for a ready group profile', () => {
    expect(profileBlockers(READY)).toEqual([])
    expect(profileBlockers({ ...READY, isPublic: true })).toEqual([])
  })

  it('offers the next step for every blocker that has one', () => {
    const blockers = profileBlockers({
      ...READY,
      errors: ['Name is required.'],
      duplicateName: 'A profile with this name already exists.',
      isPublic: true,
      hasKey: false,
    })

    expect(blockers.map((blocker) => blocker.action?.label))
      .toEqual([undefined, 'Change the name', 'Create S3 credentials'])
    expect(blockers[1].action?.step).toBe(1)
    expect(blockers[2].action?.route).toEqual({ name: 'settings', query: { tab: 'access' } })
  })

  it('names the in-flight create as its own reason', () => {
    expect(profileBlockers({ ...READY, publishing: true }).map((blocker) => blocker.message))
      .toEqual(['The profile is being created.'])
  })
})
