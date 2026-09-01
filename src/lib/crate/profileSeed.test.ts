import { describe, expect, it } from 'vitest'
import { applyProfile, clearProfile, profileExpectation } from './profileSeed'
import { findEntity, newDraft, setProperty } from './editor'
import type { MetadataProfile } from '@/data/types'
import type { ProfilePropertyRule } from '@/lib/profiles/types'

function rule(overrides: Partial<ProfilePropertyRule>): ProfilePropertyRule {
  return {
    id: overrides.valueName ?? 'rule',
    label: overrides.label ?? 'Rule',
    description: '',
    kind: 'text',
    propertyUri: `http://schema.org/${overrides.valueName ?? 'rule'}`,
    valueName: overrides.valueName ?? 'rule',
    obligation: 'MUST',
    ...overrides,
  }
}

function profile(): MetadataProfile {
  return {
    id: 'profile-1',
    name: 'Genomics',
    shortName: 'Genomics',
    description: '',
    domain: 'life sciences',
    iconColor: 'sky',
    suggestedKeywords: [],
    managed: false,
    propertyRules: [
      rule({ valueName: 'identifier', label: 'Identifier' }),
      rule({ valueName: 'author', label: 'Author', kind: 'entity', entityTypes: ['http://schema.org/Person'] }),
      rule({ valueName: 'citation', label: 'Citation', obligation: 'SHOULD' }),
    ],
    entityRules: [{
      id: 'person',
      label: 'Person',
      description: '',
      type: 'http://schema.org/Person',
      className: 'Person',
      propertyRules: [rule({ valueName: 'affiliation', label: 'Affiliation' })],
    }],
  }
}

describe('profile seeding', () => {
  it('pre-adds a row per mandatory root property', () => {
    const draft = applyProfile(newDraft(), profile())
    const root = draft.entities[0]

    expect(root.properties.identifier).toEqual([{ kind: 'text', value: '' }])
    expect(root.properties.citation).toBeUndefined()
  })

  it('creates the entity a mandatory reference points at', () => {
    const draft = applyProfile(newDraft(), profile(), 'https://example.test/profile')
    const person = findEntity(draft, '#person')

    expect(draft.entities[0].properties.author).toEqual([{ kind: 'reference', value: '#person' }])
    expect(draft.entities[0].properties.conformsTo).toEqual([
      { kind: 'reference', value: 'https://example.test/profile' },
    ])
    expect(person?.types).toEqual(['http://schema.org/Person'])
    expect(person?.properties.affiliation).toEqual([{ kind: 'text', value: '' }])
  })

  it('seeds a parts row rather than an empty file the node would refuse', () => {
    const withParts = profile()
    withParts.propertyRules = [
      ...withParts.propertyRules,
      rule({ valueName: 'hasPart', label: 'Has part', kind: 'entity', entityTypes: ['http://schema.org/MediaObject'] }),
    ]
    const draft = applyProfile(newDraft(), withParts)

    expect(draft.entities[0].properties.hasPart).toEqual([{ kind: 'reference', value: '' }])
    expect(draft.entities.some((entity) => entity.types.includes('http://schema.org/MediaObject'))).toBe(false)
  })

  it('leaves a filled row alone', () => {
    const first = applyProfile(newDraft(), profile())
    const edited = { ...first, entities: first.entities.map((entity) => (entity.id === './'
      ? { ...entity, properties: { ...entity.properties, identifier: [{ kind: 'text' as const, value: 'doi:10' }] } }
      : entity)) }

    expect(applyProfile(edited, profile()).entities[0].properties.identifier)
      .toEqual([{ kind: 'text', value: 'doi:10' }])
  })

  it('replaces only the previously selected conformance profile', () => {
    const spec = 'https://w3id.org/ro/crate/1.1'
    const community = 'https://example.test/community-profile'
    const previous = 'https://example.test/profiles/old'
    const next = 'https://example.test/profiles/new'
    const draft = setProperty(newDraft(), './', 'conformsTo', [spec, community, previous].map((value) => ({
      kind: 'reference' as const,
      value,
    })))

    expect(applyProfile(draft, profile(), next, previous).entities[0].properties.conformsTo).toEqual([
      { kind: 'reference', value: spec },
      { kind: 'reference', value: community },
      { kind: 'reference', value: next },
    ])
  })

  it('removes only the cleared profile from the declarations', () => {
    const spec = 'https://w3id.org/ro/crate/1.1'
    const previous = 'https://example.test/profiles/old'
    const draft = setProperty(newDraft(), './', 'conformsTo', [spec, previous].map((value) => ({
      kind: 'reference' as const,
      value,
    })))

    expect(clearProfile(draft, previous).entities[0].properties.conformsTo)
      .toEqual([{ kind: 'reference', value: spec }])
  })

  it('drops conformsTo when the cleared profile was its only value', () => {
    const iri = 'https://example.test/profiles/only'
    const seeded = applyProfile(newDraft(), profile(), iri)
    const cleared = clearProfile(seeded, iri)

    expect(cleared.entities[0].properties.conformsTo).toBeUndefined()
    // Seeded rows and the entity a mandatory reference created stay behind.
    expect(cleared.entities[0].properties.identifier).toEqual([{ kind: 'text', value: '' }])
    expect(findEntity(cleared, '#person')).toBeDefined()
  })

  it('names the mandatory properties and types as expectations', () => {
    expect(profileExpectation(profile())).toEqual({
      name: 'Genomics',
      properties: ['identifier', 'author'],
      types: ['http://schema.org/Person'],
      contents: [],
    })
  })
})
