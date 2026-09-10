import { describe, expect, it } from 'vitest'
import { applyProfile, clearProfile, profileExpectation, seedNewEntities } from './profileSeed'
import { addEntity, findEntity, newDraft, setProperty, toRoCrate, updateValue, type CrateDraft } from './editor'
import { contextTermsOf } from '@/lib/profiles/contextTerms'
import { profileReferenceIri } from '@/composables/aruna/profileIri'
import { PROCESS_RUN_CRATE_PROFILE, PROCESS_RUN_PROFILE_URI } from '@/lib/profiles/builtinProfiles'
import type { MetadataProfile } from '@/data/types'
import type { ProfilePropertyRule } from '@/lib/profiles/types'

/** The entity one reference row points at. */
function linked(draft: CrateDraft, entityId: string, property: string) {
  const target = findEntity(draft, entityId)?.properties[property]?.[0]?.value ?? ''
  return findEntity(draft, target)
}

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
  it('exports a selected one-of value with the profile property URI', () => {
    const chosen = profile()
    const uri = 'https://example.org/study#studyDesign'
    chosen.contextTerms = { studyDesign: uri }
    chosen.propertyRules = [rule({
      valueName: 'studyDesign', propertyUri: uri, kind: 'enum', enumOptions: ['Field experiment'],
    })]
    const iri = 'https://example.org/profile'
    const draft = updateValue(applyProfile(newDraft(), chosen, iri), './', 'studyDesign', 0, 'Field experiment')
    const crate = toRoCrate(draft)

    expect(contextTermsOf(crate['@context']).studyDesign).toBe(uri)
    expect((crate['@graph'] as Record<string, unknown>[]).find((entity) => entity['@id'] === './')?.studyDesign)
      .toBe('Field experiment')
    expect(applyProfile(draft, chosen).context).toEqual(draft.context)
    expect(clearProfile(draft, iri).context).toEqual(draft.context)
  })

  it('adds rule-derived mappings while preserving imported context definitions', () => {
    const chosen = profile()
    chosen.entityRules[0].propertyRules.push(rule({
      valueName: 'specialty', propertyUri: 'https://example.org/study#specialty',
    }))
    chosen.contextTerms = { existing: 'https://example.org/profile#existing' }
    const context = ['https://w3id.org/ro/crate/1.3/context', {
      '@language': 'en', existing: { '@id': 'https://example.org/imported#existing', '@type': '@id' },
    }]
    const draft = applyProfile({ ...newDraft(), context }, chosen)

    expect(draft.context).toEqual([...context, { specialty: 'https://example.org/study#specialty' }])
    expect(applyProfile(draft, chosen).context).toEqual(draft.context)
  })

  it('pre-adds a row per required and recommended root property', () => {
    const draft = applyProfile(newDraft(), profile())
    const root = draft.entities[0]

    expect(root.properties.identifier).toEqual([{ kind: 'text', value: '' }])
    expect(root.properties.citation).toEqual([{ kind: 'text', value: '' }])
  })

  it('pre-fills a row with the default the rule names', () => {
    const withDefault = profile()
    withDefault.propertyRules = [rule({ valueName: 'identifier', defaultValue: 'doi:10.1234/pending' })]
    const draft = applyProfile(newDraft(), withDefault)

    expect(draft.entities[0].properties.identifier).toEqual([{ kind: 'text', value: 'doi:10.1234/pending' }])
  })

  it('seeds an entity created later with the rows its shape asks for', () => {
    const before = applyProfile(newDraft(), profile())
    const created = addEntity(before, { type: 'Person', name: 'Grace Hopper' })
    const seeded = seedNewEntities(before, created.draft, profile())

    expect(findEntity(seeded, created.entity.id)?.properties.affiliation).toEqual([{ kind: 'text', value: '' }])
    expect(findEntity(seeded, '#person')?.properties.affiliation).toEqual([{ kind: 'text', value: '' }])
    expect(seedNewEntities(seeded, seeded, profile())).toBe(seeded)
  })

  it('leaves an optional property to the author', () => {
    const withOptional = profile()
    withOptional.propertyRules = [
      ...withOptional.propertyRules,
      rule({ valueName: 'funder', label: 'Funder', obligation: 'MAY' }),
    ]

    expect(applyProfile(newDraft(), withOptional).entities[0].properties.funder).toBeUndefined()
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

  it('seeds the same profile twice without duplicating anything', () => {
    // The pick seeds before a public profile's rules are known, and again after.
    const iri = 'https://example.test/profiles/only'
    const once = applyProfile(newDraft(), profile(), iri, iri)
    const twice = applyProfile(once, profile(), iri, iri)

    expect(twice.entities[0].properties.conformsTo).toEqual([{ kind: 'reference', value: iri }])
    expect(twice.entities[0].properties.author).toEqual([{ kind: 'reference', value: '#person' }])
    expect(twice.entities.filter((entity) => entity.types.includes('http://schema.org/Person'))).toHaveLength(1)
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

  it('splits the rules it carries by how strongly they are asked', () => {
    const expectation = profileExpectation(profile())

    expect(expectation.name).toBe('Genomics')
    expect(expectation.root.required.map((entry) => entry.valueName)).toEqual(['identifier', 'author'])
    expect(expectation.root.recommended.map((entry) => entry.valueName)).toEqual(['citation'])
    expect(expectation.shapes.Person.required.map((entry) => entry.valueName)).toEqual(['affiliation'])
    expect(expectation.types).toEqual(['http://schema.org/Person'])
    expect(expectation.contents).toEqual([])
  })

  it('carries the rules of every described type', () => {
    const expectation = profileExpectation(PROCESS_RUN_CRATE_PROFILE)

    expect(expectation.shapes.CreateAction.label).toBe('Run action')
    expect(expectation.shapes.CreateAction.required.map((entry) => entry.valueName)).toEqual(['instrument'])
    expect(expectation.shapes.CreateAction.recommended.map((entry) => entry.valueName))
      .toEqual(['name', 'description', 'endTime', 'agent', 'result'])
    expect(expectation.shapes.CreateAction.optional.map((entry) => entry.valueName))
      .toContain('startTime')
  })
})

describe('the built-in process run profile', () => {
  function applied() {
    return applyProfile(newDraft(), PROCESS_RUN_CRATE_PROFILE, profileReferenceIri(PROCESS_RUN_CRATE_PROFILE))
  }

  it('declares the IRI the profile is referenced by', () => {
    expect(profileReferenceIri(PROCESS_RUN_CRATE_PROFILE)).toBe(PROCESS_RUN_PROFILE_URI)
    expect(applied().entities[0].properties.conformsTo)
      .toEqual([{ kind: 'reference', value: PROCESS_RUN_PROFILE_URI }])
  })

  it('creates the run action the root should mention', () => {
    const draft = applied()
    const action = linked(draft, './', 'mentions')

    expect(action?.types).toEqual(['http://schema.org/CreateAction'])
    expect(action?.properties.endTime).toEqual([{ kind: 'datetime', value: '' }])
    expect(action?.properties.name).toEqual([{ kind: 'text', value: '' }])
    expect(action?.properties.description).toEqual([{ kind: 'longtext', value: '' }])
    // A file the run produced is picked, never invented as an empty entity.
    expect(action?.properties.result).toEqual([{ kind: 'reference', value: '' }])
    expect(action?.properties.startTime).toBeUndefined()
  })

  it('describes the instrument the run action must name', () => {
    const draft = applied()
    const action = linked(draft, './', 'mentions')
    const instrument = linked(draft, action?.id ?? '', 'instrument')

    expect(instrument?.types).toEqual(['http://schema.org/SoftwareApplication'])
    expect(instrument?.properties.softwareVersion).toEqual([{ kind: 'text', value: '' }])
    expect(instrument?.properties.url).toEqual([{ kind: 'url', value: '' }])
    expect(instrument?.properties.identifier).toBeUndefined()
  })

  it('creates each referenced entity once when it is applied again', () => {
    const once = applied()
    const twice = applyProfile(once, PROCESS_RUN_CRATE_PROFILE, PROCESS_RUN_PROFILE_URI, PROCESS_RUN_PROFILE_URI)

    expect(twice.entities.map((entity) => entity.id)).toEqual(once.entities.map((entity) => entity.id))
    expect(twice.entities[0].properties.mentions).toEqual(once.entities[0].properties.mentions)
  })

  it('keeps what the author already wrote down', () => {
    const draft = applied()
    const action = linked(draft, './', 'mentions')
    const edited = setProperty(draft, action?.id ?? '', 'name', [{ kind: 'text', value: 'Alignment run' }])
    const again = applyProfile(edited, PROCESS_RUN_CRATE_PROFILE, PROCESS_RUN_PROFILE_URI, PROCESS_RUN_PROFILE_URI)

    expect(linked(again, './', 'mentions')?.properties.name).toEqual([{ kind: 'text', value: 'Alignment run' }])
  })
})
