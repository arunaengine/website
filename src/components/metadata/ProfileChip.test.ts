import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { profileChipHasReference, profileChipValidationLabel } from './ProfileChip.vue'

describe('ProfileChip validation presentation', () => {
  it('never turns a reference without backend status into verified conformance', () => {
    expect(profileChipValidationLabel()).toBe('not checked')
    expect(profileChipValidationLabel({ status: 'verified' })).toBe('verified')
  })

  it('does not request or render validation for an unprofiled document', () => {
    expect(profileChipHasReference({ profileId: '', conformsToIds: [] })).toBe(false)
    expect(profileChipHasReference({ profileId: 'profile-a', conformsToIds: [] })).toBe(true)
    expect(profileChipHasReference({ profileId: '', conformsToIds: ['https://profiles.test/a'] })).toBe(true)

    const source = readFileSync(fileURLToPath(new URL('./ProfileChip.vue', import.meta.url)), 'utf8')
    expect(source).toContain('if (documentId && profiled) void loadProfileValidationStatus')
    expect(source).toContain('v-if="hasProfileReference"')
    expect(source.match(/class="-m-1 p-1 font-medium/g)).toHaveLength(2)
  })
})
