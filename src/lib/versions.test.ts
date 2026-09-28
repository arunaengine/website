import { describe, expect, it } from 'vitest'
import { ApiError, type DatasetBranch, type DatasetVersion } from '@/lib/api'
import { authorName, historyProblem, propertyRow, valueText, visibleBranches, writeMessage } from './versions'

function version(author: DatasetVersion['author']): DatasetVersion {
  return {
    version: 'a'.repeat(40),
    parents: [],
    created_at: '2026-09-25T10:00:00Z',
    author,
    message: 'Edit',
    signed: false,
    branches: ['main'],
    tags: [],
  }
}

describe('valueText', () => {
  it('shows links as their id and never None', () => {
    expect(valueText({ '@id': '#Person_Ada' })).toBe('#Person_Ada')
    expect(valueText(null)).toBe('no value')
    expect(valueText(3)).toBe('3')
    expect(valueText({ '@value': 'x', '@language': 'en' })).toBe('{"@value":"x","@language":"en"}')
  })
})

describe('propertyRow', () => {
  it('shows an empty side as no value', () => {
    expect(propertyRow({ name: 'name', before: [], after: ['Ada'] })).toEqual({
      name: 'name',
      multiple: false,
      before: ['no value'],
      after: ['Ada'],
    })
  })

  it('lists only removed and added items of a multi-valued property', () => {
    const row = propertyRow({
      name: 'hasPart',
      before: [{ '@id': 'a/' }, { '@id': 'b/' }],
      after: [{ '@id': 'b/' }, { '@id': 'c/' }],
    })
    expect(row).toEqual({ name: 'hasPart', multiple: true, before: ['a/'], after: ['c/'] })
  })
})

describe('authorName', () => {
  it('uses the resolved name only for node-made versions', () => {
    expect(authorName(version({ name: 'Aruna', email: 'git@aruna.local', user_id: 'u1' }), 'Ada Lovelace')).toBe('Ada Lovelace')
    expect(authorName(version({ name: 'Aruna', email: 'git@aruna.local', user_id: 'u1' }), null)).toBe('Aruna')
    expect(authorName(version({ name: 'Grace', email: 'grace@example.org', user_id: null }), 'Other')).toBe('Grace')
  })
})

describe('visibleBranches', () => {
  it('puts main first, then drafts, and hides other protected lines', () => {
    const branch = (name: string, protectedBranch: boolean) =>
      ({ name, protected: protectedBranch, version: 'v', head: version({ name: 'Aruna', email: '' }) }) as DatasetBranch
    const names = visibleBranches([branch('aruna', true), branch('draft/b', false), branch('main', true), branch('draft/a', false)])
      .map((entry) => entry.name)
    expect(names).toEqual(['main', 'draft/a', 'draft/b'])
  })
})

describe('historyProblem', () => {
  it('tells missing versions, other holders and older nodes apart', () => {
    expect(historyProblem(new ApiError(404, 'no branch', 'branch_missing'))).toBe('missing')
    expect(historyProblem(new ApiError(404, 'ask another node', 'not_holder'))).toBe('not-holder')
    expect(historyProblem(new ApiError(404, 'Not Found'))).toBe('unsupported')
    expect(historyProblem(new ApiError(404, 'gone', 'not_found'))).toBe('error')
    expect(historyProblem(new ApiError(503, 'later', 'git_unavailable'))).toBe('error')
    expect(historyProblem(new ApiError(403, 'no'))).toBe('forbidden')
    expect(historyProblem(new Error('offline'))).toBe('error')
  })
})

describe('writeMessage', () => {
  it('maps write refusals to plain messages', () => {
    expect(writeMessage(new ApiError(412, 'stale', 'stale'), 'main')).toBe('main changed. Reload and try again.')
    expect(writeMessage(new ApiError(409, 'exists', 'exists'))).toBe('A branch or tag with this name already exists.')
    expect(writeMessage(new ApiError(400, 'Invalid branch name', 'refused'))).toBe('Invalid branch name')
    expect(writeMessage(new ApiError(403, 'forbidden'))).toBe('You do not have write access to this dataset.')
  })
})
