import { describe, expect, it } from 'vitest'
import { profileChipValidationLabel } from './ProfileChip.vue'

describe('ProfileChip validation presentation', () => {
  it('never turns a reference without backend status into verified conformance', () => {
    expect(profileChipValidationLabel()).toBe('not checked')
    expect(profileChipValidationLabel({ status: 'verified' })).toBe('verified')
  })
})
