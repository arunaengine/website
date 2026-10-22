import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  countWords,
  customProblem,
  namingChoice,
  namingExample,
  namingPattern,
  scheduleOptions,
  syncStatus,
  templateProblem,
} from './bucketNaming'

describe('naming', () => {
  it('maps stored patterns to choices and back', () => {
    expect(namingChoice(undefined)).toBe('plain')
    expect(namingChoice('{dir}{name}~{id}')).toBe('suffix')
    expect(namingChoice('{dir}{id}_{name}')).toBe('prefix')
    expect(namingChoice('{dir}raw/{name}')).toBe('custom')
    expect(namingPattern('prefix', '')).toBe('{dir}{id}_{name}')
    expect(namingPattern('custom', ' raw/{name} ')).toBe('{dir}raw/{name}')
  })

  it('refuses a custom name without {name} or with unknown placeholders', () => {
    expect(customProblem('raw/{id}')).toBe('The name needs {name}.')
    expect(customProblem('{date}/{name}')).toContain('{date}')
    expect(customProblem('raw/{name}')).toBeNull()
  })

  it('adds the fallback only when the name has no {id}', () => {
    expect(namingExample('{dir}{name}')).toBe('b.fa.gz (or b.fa.gz~01JA7Q3K if taken)')
    expect(namingExample('{dir}{id}_{name}')).toBe('01JA7Q3K_b.fa.gz')
  })
})

describe('schedules', () => {
  it('keeps a stored custom schedule as a choice', () => {
    expect(scheduleOptions('0 3 * * *')).toHaveLength(4)
    expect(scheduleOptions('5 4 * * *').at(-1)?.value).toBe('5 4 * * *')
  })
})

describe('sync status', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-22T12:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  const run = (state: string, extra = {}) => ({
    job_id: 'j',
    state,
    started_at: '2026-10-19T12:00:00Z',
    imported: 6,
    skipped: 0,
    failed: 0,
    errors: [],
    ...extra,
  })

  it('shows a short mark with the details on hover', () => {
    expect(syncStatus(run('succeeded'), '')).toEqual({
      text: '✓ 3d ago',
      tone: 'ok',
      title: 'Last sync 3d ago, found 6 new files. Sync runs only when started.',
    })
    expect(syncStatus(run('failed', { error: 'denied' }), '0 * * * *').title).toContain('denied')
    expect(syncStatus(null, '').text).toBe('Not synced')
  })
})

describe('templates and counts', () => {
  it('needs {bucket} and a valid S3 name', () => {
    expect(templateProblem('aruna-{group}', 'spire')).toContain('{bucket}')
    expect(templateProblem('Aruna_{bucket}', 'spire')).toContain('a-z')
    expect(templateProblem('aruna-{group}-{bucket}', 'spire')).toBeNull()
  })

  it('says at least for a partial count', () => {
    expect(countWords(6, false)).toBe('at least 6 files')
    expect(countWords(1, true)).toBe('1 file')
  })
})
