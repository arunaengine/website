import { describe, expect, it } from 'vitest'
import {
  BUCKET_NAME_REQUIREMENT,
  bucketNameProblem,
  folderNameProblem,
  objectKeyProblem,
} from './bucketName'

describe('bucket name rules', () => {
  it('names the rule a bucket name breaks', () => {
    const cases: Array<[string, string | null]> = [
      ['b1', 'Bucket names must contain at least 3 characters.'],
      ['b'.repeat(64), 'Bucket names must contain at most 63 characters.'],
      ['Reef-Survey', 'Bucket names may only contain lowercase letters, digits, dots and dashes.'],
      ['reef_survey', 'Bucket names may only contain lowercase letters, digits, dots and dashes.'],
      ['-reef', 'Bucket names must start and end with a letter or a digit.'],
      ['reef.', 'Bucket names must start and end with a letter or a digit.'],
      ['reef..survey', 'Bucket names must not contain two dots in a row.'],
      ['192.168.0.1', 'Bucket names must not look like an IP address.'],
      ['xn--abc', 'Bucket names must not start with xn--.'],
      ['reef-survey-2026', null],
      ['b'.repeat(63), null],
      ['reef.survey.2026', null],
      ['192.168.0.256', null],
      ['1.2.3.4.5', null],
    ]
    for (const [name, expected] of cases) expect([name, bucketNameProblem(name)]).toEqual([name, expected])
  })

  it('states the whole rule in one sentence for the input', () => {
    expect(BUCKET_NAME_REQUIREMENT).toBe(
      '3 to 63 characters: lowercase letters, digits, dots and dashes, starting and ending with a letter or digit.',
    )
  })
})

describe('folder and key rules', () => {
  it('refuses a folder name that is not one path segment', () => {
    expect(folderNameProblem('')).toBe('A folder needs a name.')
    expect(folderNameProblem('raw/reads')).toBe('A folder name cannot contain a slash.')
    expect(folderNameProblem('..')).toBe('A folder cannot be named "." or "..".')
    expect(folderNameProblem('ä'.repeat(513))).toBe('A folder name may be at most 1024 bytes.')
    expect(folderNameProblem('raw reads')).toBeNull()
  })

  it('refuses a key the node cannot address', () => {
    expect(objectKeyProblem('')).toBe('An object key needs at least one character.')
    expect(objectKeyProblem('/raw/reads.fq')).toBe('An object key cannot start with a slash.')
    expect(objectKeyProblem('raw//reads.fq')).toBe('An object key cannot contain an empty path segment.')
    expect(objectKeyProblem('raw/reads.fq/')).toBe('An object key cannot contain an empty path segment.')
    expect(objectKeyProblem('raw/./reads.fq')).toBe('An object key cannot contain a "." or ".." segment.')
    expect(objectKeyProblem('ä'.repeat(513))).toBe('An object key may be at most 1024 bytes.')
    expect(objectKeyProblem('raw/reads.fq')).toBeNull()
  })
})
