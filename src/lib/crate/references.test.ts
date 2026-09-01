import { describe, expect, it } from 'vitest'
import {
  addFilePart,
  addSubcratePart,
  linkReference,
  orphanAfterUnlink,
  rootParts,
  setReference,
  unlinkReference,
} from './references'
import { orphanedDataEntities } from './orphans'
import { addEntity, addValue, findEntity, newDraft, type CrateDraft } from './editor'

function seeded(): CrateDraft {
  return addFilePart(newDraft(), { id: 's3://bucket/one.csv', name: 'one.csv' })
}

describe('linkReference', () => {
  it('names a target once however often it is linked', () => {
    const once = linkReference(newDraft(), './', 'hasPart', 's3://bucket/one.csv')
    const twice = linkReference(once, './', 'hasPart', 's3://bucket/one.csv')

    expect(findEntity(twice, './')?.properties.hasPart).toEqual([
      { kind: 'reference', value: 's3://bucket/one.csv' },
    ])
  })

  it('fills the empty row a prompt left instead of adding beside it', () => {
    const prompted = addValue(newDraft(), './', 'hasPart', { kind: 'reference', value: '' })
    const linked = linkReference(prompted, './', 'hasPart', 's3://bucket/one.csv')

    expect(findEntity(linked, './')?.properties.hasPart).toEqual([
      { kind: 'reference', value: 's3://bucket/one.csv' },
    ])
  })

  it('links a part of a folder, not only of the root', () => {
    const folder = addFilePart(newDraft(), { id: 's3://bucket/raw/', name: 'raw', type: 'Dataset' })
    const nested = addFilePart(folder, { id: 's3://bucket/raw/one.csv', name: 'one.csv' }, {
      entityId: 's3://bucket/raw/',
      property: 'hasPart',
    })

    expect(findEntity(nested, 's3://bucket/raw/')?.properties.hasPart).toEqual([
      { kind: 'reference', value: 's3://bucket/raw/one.csv' },
    ])
    expect(findEntity(nested, './')?.properties.hasPart).toEqual([
      { kind: 'reference', value: 's3://bucket/raw/' },
    ])
    expect(orphanedDataEntities(nested)).toEqual([])
  })

  it('ignores an empty target', () => {
    expect(linkReference(newDraft(), './', 'hasPart', '  ')).toEqual(newDraft())
  })

  it('points the dataset at its own parts list by default', () => {
    expect(rootParts(newDraft())).toEqual({ entityId: './', property: 'hasPart' })
  })
})

describe('setReference', () => {
  it('changes one row without leaving a second entry for the same target', () => {
    const two = linkReference(seeded(), './', 'hasPart', 's3://bucket/two.csv')
    const same = setReference(two, './', 'hasPart', 1, 's3://bucket/one.csv')

    expect(findEntity(same, './')?.properties.hasPart).toEqual([
      { kind: 'reference', value: 's3://bucket/one.csv' },
    ])
  })

  it('fills an empty row the property already carries', () => {
    const prompted = addValue(newDraft(), './', 'author', { kind: 'reference', value: '' })
    const linked = setReference(prompted, './', 'author', 0, '#ada-lovelace')

    expect(findEntity(linked, './')?.properties.author).toEqual([
      { kind: 'reference', value: '#ada-lovelace' },
    ])
  })
})

describe('unlinkReference', () => {
  it('offers the file that unlinking would orphan', () => {
    const orphan = orphanAfterUnlink(seeded(), './', 'hasPart', 0)

    expect(orphan?.id).toBe('s3://bucket/one.csv')
  })

  it('says nothing when another part still reaches the file', () => {
    const folder = addFilePart(seeded(), { id: 's3://bucket/raw/', name: 'raw', type: 'Dataset' })
    const shared = linkReference(folder, 's3://bucket/raw/', 'hasPart', 's3://bucket/one.csv')

    expect(orphanAfterUnlink(shared, './', 'hasPart', 0)).toBeUndefined()
  })

  it('takes the orphaned file with the reference when asked', () => {
    const draft = unlinkReference(seeded(), './', 'hasPart', 0, { dropRow: true, removeTarget: true })

    expect(findEntity(draft, 's3://bucket/one.csv')).toBeUndefined()
    expect(findEntity(draft, './')?.properties.hasPart).toBeUndefined()
  })

  it('keeps the file when only the reference is dropped', () => {
    const draft = unlinkReference(seeded(), './', 'hasPart', 0, { dropRow: true })

    expect(findEntity(draft, 's3://bucket/one.csv')).toBeDefined()
    expect(orphanedDataEntities(draft).map((entity) => entity.id)).toEqual(['s3://bucket/one.csv'])
  })

  it('clears the value back to a prompt unless the row is dropped', () => {
    const draft = unlinkReference(seeded(), './', 'hasPart', 0)

    expect(findEntity(draft, './')?.properties.hasPart).toEqual([{ kind: 'reference', value: '' }])
  })
})

describe('orphanedDataEntities', () => {
  it('leaves a contextual entity alone', () => {
    const draft = addEntity(newDraft(), { type: 'Person', name: 'Ada Lovelace' }).draft

    expect(orphanedDataEntities(draft)).toEqual([])
  })

  it('reports a file nothing links and a subcrate that lost its link', () => {
    const file = addEntity(newDraft(), { type: 'File', id: 's3://bucket/stray.csv' }).draft
    const linked = addSubcratePart(file, { iri: 'https://example.test/child', name: 'Child' })
    const unlinked = unlinkReference(linked, './', 'hasPart', 0, { dropRow: true })

    expect(orphanedDataEntities(unlinked).map((entity) => entity.id)).toEqual([
      's3://bucket/stray.csv',
      'https://example.test/child',
    ])
  })
})
