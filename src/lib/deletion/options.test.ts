import { describe, expect, it } from 'vitest'
import {
  bucketIsEmpty,
  deletionOptions,
  type DeletionCounts,
  type DeletionKind,
  type DeletionTarget,
} from './options'

const allowed = { canWrite: true, canPurge: true }

function target(overrides: Partial<DeletionTarget> = {}): DeletionTarget {
  return { kind: 'object', permissions: allowed, remote: false, ...overrides }
}

function counts(overrides: Partial<DeletionCounts> = {}): DeletionCounts {
  return {
    currentHeads: 0,
    noncurrentVersions: 0,
    deleteMarkers: 0,
    openMultipartUploads: 0,
    complete: true,
    ...overrides,
  }
}

function ids(overrides: Partial<DeletionTarget> = {}): string[] {
  return deletionOptions(target(overrides)).map((option) => option.id)
}

const KINDS: DeletionKind[] = [
  'object',
  'deleted-object',
  'version',
  'marker',
  'folder',
  'selection',
  'bucket',
]

describe('deletion options', () => {
  it('offers delete, one version and permanent deletion for a live object', () => {
    expect(ids()).toEqual(['delete', 'delete-version', 'delete-permanently'])
    // The file itself names no version, so this outcome has to ask for one.
    const single = deletionOptions(target()).find((option) => option.id === 'delete-version')
    expect(single?.label).toBe('Delete one version permanently')
    expect(single?.description).toContain('Choose it below')
  })

  it('offers restore instead of delete once the head is a marker', () => {
    expect(ids({ kind: 'deleted-object' })).toEqual(['restore', 'delete-permanently'])
    expect(ids({ kind: 'object', headState: 'marker' })).toEqual(['restore', 'delete-permanently'])
    expect(ids({ kind: 'deleted-object', headState: 'live' })).toEqual([
      'delete',
      'delete-version',
      'delete-permanently',
    ])
  })

  it('separates the current version from an older one', () => {
    expect(ids({ kind: 'version', isCurrent: true })).toEqual(['delete-version'])
    expect(ids({ kind: 'version', isCurrent: false })).toEqual(['make-current', 'delete-version'])
  })

  it('restores from the head marker and deletes an older one', () => {
    expect(ids({ kind: 'marker', isCurrent: true })).toEqual(['restore'])
    expect(ids({ kind: 'marker', isCurrent: false })).toEqual(['delete-version'])
  })

  it('picks the bucket call from the preflight inventory', () => {
    expect(ids({ kind: 'bucket', counts: counts() })).toEqual(['delete-bucket'])
    expect(ids({ kind: 'bucket', counts: counts({ deleteMarkers: 1 }) })).toEqual([
      'delete-permanently',
    ])
    expect(ids({ kind: 'bucket', counts: counts({ complete: false }) })).toEqual([
      'delete-permanently',
    ])
    expect(ids({ kind: 'bucket', counts: null })).toEqual(['delete-permanently'])
    expect(bucketIsEmpty(counts({ openMultipartUploads: 2 }))).toBe(false)
  })

  it('raises the tier with the blast radius', () => {
    const tier = (overrides: Partial<DeletionTarget>, id: string) =>
      deletionOptions(target(overrides)).find((option) => option.id === id)?.tier

    expect(tier({}, 'delete')).toBe('one-click')
    expect(tier({ kind: 'marker', isCurrent: true }, 'restore')).toBe('one-click')
    expect(tier({ kind: 'version', isCurrent: false }, 'delete-version')).toBe('confirm')
    expect(tier({}, 'delete-permanently')).toBe('confirm')
    expect(tier({ kind: 'folder' }, 'delete')).toBe('confirm')
    expect(tier({ kind: 'folder' }, 'delete-permanently')).toBe('typed-name')
    expect(tier({ kind: 'bucket', counts: counts() }, 'delete-bucket')).toBe('typed-name')
    expect(tier({ kind: 'bucket', counts: null }, 'delete-permanently')).toBe('typed-name')
  })

  it('names the exact call each outcome makes', () => {
    const call = (overrides: Partial<DeletionTarget>, id: string) =>
      deletionOptions(target(overrides)).find((option) => option.id === id)?.call.operation

    expect(call({}, 'delete')).toBe('write-marker')
    expect(call({ kind: 'folder' }, 'delete')).toBe('write-markers')
    expect(call({ kind: 'selection' }, 'delete')).toBe('write-markers')
    expect(call({ kind: 'deleted-object' }, 'restore')).toBe('delete-version')
    expect(call({ kind: 'version', isCurrent: false }, 'make-current')).toBe('copy-version')
    expect(call({ kind: 'version', isCurrent: true }, 'delete-version')).toBe('delete-version')
    expect(call({}, 'delete-permanently')).toBe('purge')
    expect(call({ kind: 'bucket', counts: counts() }, 'delete-bucket')).toBe('delete-bucket')
  })

  it('says why a session may not delete', () => {
    const denied = { canWrite: false, canPurge: true }

    expect(deletionOptions(target({ permissions: denied }))[0].disabledReason).toBe(
      'This session cannot delete this object.',
    )
    expect(
      deletionOptions(target({ kind: 'folder', permissions: denied }))[0].disabledReason,
    ).toBe('This session cannot delete this entire folder.')
    expect(
      deletionOptions(target({ kind: 'selection', permissions: denied }))[0].disabledReason,
    ).toBe('This session cannot delete every selected object.')
  })

  it('says why permanent deletion is unavailable', () => {
    const permanent = (overrides: Partial<DeletionTarget>) =>
      deletionOptions(target(overrides)).find((option) => option.id === 'delete-permanently')
        ?.disabledReason

    expect(permanent({ remote: true })).toContain('node that holds this bucket')
    expect(permanent({ permissions: { canWrite: true, canPurge: null } })).toContain('Checking')
    expect(permanent({ permissions: { canWrite: true, canPurge: false } })).toContain(
      'may not delete it permanently',
    )
    expect(permanent({})).toBeNull()
  })

  it('keeps a marker delete available on a remote bucket', () => {
    // Only the purge job needs the holding node's API; a marker is plain S3.
    const options = deletionOptions(target({ remote: true }))
    const reason = (id: string) =>
      options.find((option) => option.id === id)?.disabledReason ?? null

    expect(reason('delete')).toBeNull()
    expect(reason('delete-permanently')).not.toBeNull()
  })

  it('marks every irreversible outcome and says on this node', () => {
    for (const kind of KINDS) {
      for (const isCurrent of [true, false]) {
        for (const option of deletionOptions(target({ kind, isCurrent, counts: counts() }))) {
          if (option.irreversible) expect(option.description).toContain('on this node')
          else expect(option.description).not.toContain('Nothing brings')
        }
      }
    }
  })

  it('states the quota cost of making an older version current', () => {
    const options = deletionOptions(target({ kind: 'version', isCurrent: false, bytes: 2048 }))

    expect(options[0].description).toContain('creates a new version')
    expect(options[0].description).toContain('2 KB')
    expect(options[1].description).toContain('frees 2 KB')
  })

  it('never offers an outcome twice or an empty set', () => {
    for (const kind of KINDS) {
      for (const remote of [true, false]) {
        for (const canPurge of [true, false, null]) {
          const options = deletionOptions(
            target({ kind, remote, permissions: { canWrite: true, canPurge } }),
          )
          expect(options.length).toBeGreaterThan(0)
          expect(new Set(options.map((option) => option.id)).size).toBe(options.length)
          for (const option of options) {
            expect(option.label).not.toContain('Purge')
            expect(option.description).not.toContain('\u2014')
          }
        }
      }
    }
  })
})
