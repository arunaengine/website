import { describe, expect, it } from "vitest"
import {
  EMAIL_REGEX,
  OBJECT_REGEX,
  ORCID_REGEX,
  PROJECT_REGEX,
  S3_KEY_REGEX,
  ULID_REGEX,
} from '~/composables/constants'

describe('composables/constants', () => {
  it('accepts valid project names', () => {
    expect(PROJECT_REGEX.test('project-123')).toBe(true)
    expect(PROJECT_REGEX.test('project_name')).toBe(false)
    expect(PROJECT_REGEX.test('Project-123')).toBe(false)
  })

  it('accepts valid S3 keys without path separators', () => {
    expect(S3_KEY_REGEX.test("Dataset-01_foo!'()*")).toBe(true)
    expect(S3_KEY_REGEX.test('dataset/path')).toBe(false)
  })

  it('accepts valid object names with path separators', () => {
    expect(OBJECT_REGEX.test("folder/sub-folder/file-01.txt")).toBe(true)
    expect(OBJECT_REGEX.test('bad object name')).toBe(false)
  })

  it('validates ULIDs', () => {
    expect(ULID_REGEX.test('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(true)
    expect(ULID_REGEX.test('81ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(false)
  })

  it('validates ORCID identifiers', () => {
    expect(ORCID_REGEX.test('0000-0002-1825-0097')).toBe(true)
    expect(ORCID_REGEX.test('0000-0002-1825-009')).toBe(false)
  })

  it('validates email addresses', () => {
    expect(EMAIL_REGEX.test('user@example.org')).toBe(true)
    expect(EMAIL_REGEX.test('invalid-email')).toBe(false)
  })
})
