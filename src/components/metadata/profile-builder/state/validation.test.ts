import { describe, expect, it } from 'vitest'
import { rulesHintsFor } from './validation'
import { draftFromEntityRule } from './serialization'
import type { ProfileEntityRule } from '@/lib/profiles/types'

function person(): ProfileEntityRule {
  return {
    id: 'person',
    label: 'Person',
    description: '',
    type: 'http://schema.org/Person',
    className: 'Person',
    propertyRules: [{
      id: 'name',
      label: 'Name',
      description: '',
      kind: 'text',
      propertyUri: 'http://schema.org/name',
      valueName: 'name',
      obligation: 'MUST',
    }],
  }
}

function dataset(entityTypes?: string[]): ProfileEntityRule {
  return {
    id: 'dataset',
    label: 'Root dataset',
    description: '',
    type: 'http://schema.org/Dataset',
    className: 'Dataset',
    propertyRules: entityTypes
      ? [{
          id: 'author',
          label: 'Author',
          description: '',
          kind: 'entity',
          propertyUri: 'http://schema.org/author',
          valueName: 'author',
          obligation: 'MUST',
          entityTypes,
        }]
      : [],
  }
}

function hints(normalized: ProfileEntityRule[], imported: string[] = []): string[] {
  const drafts = normalized.map((entity, index) => ({
    ...draftFromEntityRule(entity, index === 0),
    imported: imported.includes(entity.type),
  }))
  return rulesHintsFor(drafts, normalized)
}

describe('unreferenced shape hint', () => {
  it('states what an unreferenced shape does and does not do', () => {
    const [hint] = hints([dataset(), person()])

    expect(hint).toBe(
      'No property asks for a Person yet. Datasets get no Person field from this profile, '
      + 'but any Person they do describe is still checked against "Person".',
    )
  })

  it('stays quiet for the root and for a referenced shape', () => {
    expect(hints([dataset(['http://schema.org/Person']), person()])).toEqual([])
  })

  it('stays quiet for an imported shape', () => {
    expect(hints([dataset(), person()], ['http://schema.org/Person'])).toEqual([])
  })
})
