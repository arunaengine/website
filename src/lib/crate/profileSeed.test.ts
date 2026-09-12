import { describe, expect, it } from 'vitest'
import { applyProfile, clearProfile, profileExpectation, seedNewEntities, seedRules, unseedProfile } from './profileSeed'
import { addEntity, addValue, findEntity, newDraft, setProperty, toRoCrate, updateValue, type CrateDraft } from './editor'
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

  it('seeds a URL row, not a work, for a license rule of kind url', () => {
    const withLicense = profile()
    withLicense.propertyRules = [rule({ valueName: 'license', label: 'License', kind: 'url' })]
    const start = setProperty(newDraft(), './', 'license', [])
    const draft = applyProfile(start, withLicense)

    expect(draft.entities[0].properties.license).toEqual([{ kind: 'url', value: '' }])
    expect(draft.entities).toHaveLength(1)
  })

  it('seeds a URL row for an entity rule that only allows external reuse', () => {
    const reuse = profile()
    reuse.propertyRules = [rule({
      valueName: 'license', label: 'License', kind: 'entity',
      entityTypes: ['http://schema.org/CreativeWork'], entitySources: ['existing-external'],
    })]
    const start = setProperty(newDraft(), './', 'license', [])
    const draft = applyProfile(start, reuse)

    expect(draft.entities[0].properties.license).toEqual([{ kind: 'url', value: '' }])
    expect(draft.entities).toHaveLength(1)
    expect(unseedProfile(draft, reuse).entities).toEqual(start.entities)
  })

  it('seeds a link row for an entity rule that only allows crate reuse', () => {
    const reuse = profile()
    reuse.propertyRules = [rule({
      valueName: 'author', label: 'Author', kind: 'entity',
      entityTypes: ['http://schema.org/Person'], entitySources: ['existing-crate'],
    })]
    const draft = applyProfile(newDraft(), reuse)

    expect(draft.entities[0].properties.author).toEqual([{ kind: 'reference', value: '' }])
    expect(draft.entities).toHaveLength(1)
  })

  it('still creates the entity when the rule allows describing a new one', () => {
    const create = profile()
    create.propertyRules = [rule({
      valueName: 'license', label: 'License', kind: 'entity',
      entityTypes: ['http://schema.org/CreativeWork'], entitySources: ['new', 'existing-external'],
    })]
    const draft = applyProfile(setProperty(newDraft(), './', 'license', []), create)

    expect(draft.entities).toHaveLength(2)
    expect(linked(draft, './', 'license')?.types).toEqual(['http://schema.org/CreativeWork'])
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

/** A profile whose optional spatial coverage describes a place and its point. */
function placeProfile(): MetadataProfile {
  const base = profile()
  base.propertyRules = [
    ...(base.propertyRules ?? []),
    rule({
      valueName: 'spatialCoverage',
      label: 'Spatial coverage',
      kind: 'entity',
      entityTypes: ['http://schema.org/Place'],
      obligation: 'MAY',
    }),
    rule({ valueName: 'inLanguage', label: 'Language', obligation: 'MAY' }),
  ]
  base.entityRules = [
    ...(base.entityRules ?? []),
    {
      id: 'place',
      label: 'Place',
      description: '',
      type: 'http://schema.org/Place',
      className: 'Place',
      propertyRules: [
        rule({ valueName: 'name', label: 'Name', obligation: 'SHOULD' }),
        rule({
          valueName: 'geo',
          label: 'Geo',
          kind: 'entity',
          entityTypes: ['http://schema.org/GeoCoordinates'],
          obligation: 'MAY',
        }),
      ],
    },
    {
      id: 'point',
      label: 'Geo coordinates',
      description: '',
      type: 'http://schema.org/GeoCoordinates',
      className: 'GeoCoordinates',
      propertyRules: [
        rule({ valueName: 'latitude', label: 'Latitude', kind: 'number', obligation: 'MAY' }),
        rule({ valueName: 'longitude', label: 'Longitude', kind: 'number', obligation: 'MAY' }),
      ],
    },
  ]
  return base
}

describe('seeding an optional rule', () => {
  const chosen = placeProfile()
  const expectation = profileExpectation(chosen)

  function optional(valueName: string): ProfilePropertyRule {
    const found = expectation.root.optional.find((entry) => entry.valueName === valueName)
    if (!found) throw new Error(`No optional rule ${valueName}`)
    return found
  }

  it('creates the entity a picked reference describes with its own rows', () => {
    const draft = seedRules(newDraft(), expectation, './', [optional('spatialCoverage')])
    const place = linked(draft, './', 'spatialCoverage')
    const point = linked(draft, place?.id ?? '', 'geo')

    expect(place?.types).toEqual(['http://schema.org/Place'])
    expect(place?.properties.name).toEqual([{ kind: 'text', value: '' }])
    expect(point?.types).toEqual(['http://schema.org/GeoCoordinates'])
    expect(point?.properties.latitude).toEqual([{ kind: 'number', value: '' }])
    expect(point?.properties.longitude).toEqual([{ kind: 'number', value: '' }])
  })

  it('seeds every optional rule the profile still offers', () => {
    const draft = seedRules(newDraft(), expectation, './', expectation.root.optional)

    expect(findEntity(draft, './')?.properties.inLanguage).toEqual([{ kind: 'text', value: '' }])
    expect(linked(draft, './', 'spatialCoverage')).toBeDefined()
  })

  it('keeps what the author wrote and creates each entity once', () => {
    const written = setProperty(newDraft(), './', 'inLanguage', [{ kind: 'text', value: 'German' }])
    const once = seedRules(written, expectation, './', expectation.root.optional)
    const twice = seedRules(once, expectation, './', expectation.root.optional)

    expect(findEntity(twice, './')?.properties.inLanguage).toEqual([{ kind: 'text', value: 'German' }])
    expect(twice.entities.map((entity) => entity.id)).toEqual(once.entities.map((entity) => entity.id))
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

/** A profile whose person points at an organization twice, and back again. */
function peopleProfile(): MetadataProfile {
  const base = profile()
  base.propertyRules = [rule({
    valueName: 'author',
    label: 'Author',
    kind: 'entity',
    entityTypes: ['http://schema.org/Person'],
    obligation: 'MAY',
  })]
  base.entityRules = [
    {
      id: 'person',
      label: 'Person',
      description: '',
      type: 'http://schema.org/Person',
      className: 'Person',
      propertyRules: [
        rule({ valueName: 'affiliation', label: 'Affiliation', kind: 'entity', entityTypes: ['http://schema.org/Organization'] }),
        rule({ valueName: 'worksFor', label: 'Works for', kind: 'entity', entityTypes: ['http://schema.org/Organization'] }),
      ],
    },
    {
      id: 'organization',
      label: 'Organization',
      description: '',
      type: 'http://schema.org/Organization',
      className: 'Organization',
      propertyRules: [
        rule({ valueName: 'name', label: 'Name', obligation: 'SHOULD' }),
        rule({ valueName: 'founder', label: 'Founder', kind: 'entity', entityTypes: ['http://schema.org/Person'], obligation: 'MAY' }),
      ],
    },
  ]
  return base
}

describe('seeding a type that appears twice', () => {
  const expectation = profileExpectation(peopleProfile())
  const picked = expectation.root.optional[0]

  it('gives both references of one type their own rows', () => {
    const draft = seedRules(newDraft(), expectation, './', [picked])
    const person = linked(draft, './', 'author')
    const affiliation = linked(draft, person?.id ?? '', 'affiliation')
    const employer = linked(draft, person?.id ?? '', 'worksFor')

    expect(affiliation?.id).not.toBe(employer?.id)
    expect(affiliation?.properties.name).toEqual([{ kind: 'text', value: '' }])
    expect(employer?.properties.name).toEqual([{ kind: 'text', value: '' }])
  })

  it('stops where a shape points back at an ancestor', () => {
    const draft = seedRules(newDraft(), expectation, './', [picked])
    const person = linked(draft, './', 'author')
    const affiliation = linked(draft, person?.id ?? '', 'affiliation')
    const founder = linked(draft, affiliation?.id ?? '', 'founder')

    expect(founder?.types).toEqual(['http://schema.org/Person'])
    expect(founder?.properties.affiliation).toBeUndefined()
  })
})

describe('leaving a profile', () => {
  const first = 'https://example.test/profiles/genomics'
  const second = 'https://example.test/profiles/ecology'

  /** Genomics with a defaulted identifier, an author and a recommended citation. */
  function genomics(): MetadataProfile {
    const base = profile()
    base.propertyRules = [
      rule({ valueName: 'identifier', label: 'Identifier', defaultValue: 'GEN-' }),
      rule({ valueName: 'author', label: 'Author', kind: 'entity', entityTypes: ['http://schema.org/Person'] }),
      rule({ valueName: 'citation', label: 'Citation', obligation: 'SHOULD' }),
    ]
    return base
  }

  /** Ecology shares the identifier with another default and obligation. */
  function ecology(): MetadataProfile {
    const base = profile()
    base.id = 'profile-2'
    base.name = 'Ecology'
    base.propertyRules = [
      rule({ valueName: 'identifier', label: 'Sample id', obligation: 'SHOULD', defaultValue: 'ECO-' }),
      rule({ valueName: 'variableMeasured', label: 'Variable measured' }),
    ]
    return base
  }

  function named(): CrateDraft {
    return setProperty(newDraft(), './', 'name', [{ kind: 'text', value: 'Example dataset' }])
  }

  function graphOf(draft: CrateDraft) {
    return toRoCrate(draft)['@graph']
  }

  it('takes back untouched rows, defaults and the entities it created', () => {
    const start = named()
    const seeded = applyProfile(start, genomics(), first)
    expect(seeded.entities).toHaveLength(2)
    expect(JSON.stringify(graphOf(seeded))).toContain('GEN-')

    const left = clearProfile(unseedProfile(seeded, genomics()), first)

    expect(left.entities).toEqual(start.entities)
    expect(graphOf(left)).toEqual(graphOf(start))
  })

  it('keeps what the author filled and the entity they described', () => {
    let seeded = applyProfile(named(), genomics(), first)
    seeded = updateValue(seeded, './', 'citation', 0, 'doi:10.1000/example')
    const person = linked(seeded, './', 'author')
    seeded = updateValue(seeded, person?.id ?? '', 'affiliation', 0, 'Example University')

    const left = unseedProfile(seeded, genomics())

    expect(left.entities[0].properties.identifier).toBeUndefined()
    expect(left.entities[0].properties.citation).toEqual([{ kind: 'text', value: 'doi:10.1000/example' }])
    expect(linked(left, './', 'author')?.properties.affiliation).toEqual([{ kind: 'text', value: 'Example University' }])
  })

  it('keeps rows the author added on their own and links they made', () => {
    const person = addEntity(named(), { type: 'Person', name: 'Ada Lovelace' })
    let start = addValue(person.draft, './', 'author', { kind: 'reference', value: person.entity.id })
    start = addValue(start, './', 'funder', { kind: 'text', value: '' })
    start = addValue(start, './', 'version', { kind: 'text', value: '2' })

    const left = unseedProfile(applyProfile(start, genomics(), first), genomics())

    expect(left.entities[0].properties.author).toEqual([{ kind: 'reference', value: person.entity.id }])
    expect(findEntity(left, person.entity.id)?.properties.name).toEqual([{ kind: 'text', value: 'Ada Lovelace' }])
    expect(left.entities[0].properties.funder).toEqual([{ kind: 'text', value: '' }])
    expect(left.entities[0].properties.version).toEqual([{ kind: 'text', value: '2' }])
    expect(left.entities[0].properties.identifier).toBeUndefined()
  })

  it('reaches the same form whether a profile is picked directly or after another', () => {
    const direct = applyProfile(named(), ecology(), second)
    const after = applyProfile(unseedProfile(applyProfile(named(), genomics(), first), genomics()), ecology(), second, first)

    expect(after.entities).toEqual(direct.entities)
    expect(Object.keys(after.entities[0].properties)).toEqual(Object.keys(direct.entities[0].properties))
    expect(after.entities[0].properties.identifier).toEqual([{ kind: 'text', value: 'ECO-' }])
  })

  it('keeps an edited shared row instead of the next default', () => {
    const edited = updateValue(applyProfile(named(), genomics(), first), './', 'identifier', 0, 'GEN-42')

    const next = applyProfile(unseedProfile(edited, genomics()), ecology(), second, first)

    expect(next.entities[0].properties.identifier).toEqual([{ kind: 'text', value: 'GEN-42' }])
    expect(next.entities[0].properties.variableMeasured).toEqual([{ kind: 'text', value: '' }])
  })

  it('neither grows nor loses rows over ten switch cycles', () => {
    const start = named()
    let draft = start
    let current: MetadataProfile | undefined
    const iriOf = (profile: MetadataProfile) => (profile.id === 'profile-1' ? first : second)
    const pick = (profile?: MetadataProfile) => {
      if (current) draft = unseedProfile(draft, current)
      const previous = current ? iriOf(current) : undefined
      draft = profile ? applyProfile(draft, profile, iriOf(profile), previous) : clearProfile(draft, previous)
      current = profile
    }
    for (let cycle = 0; cycle < 10; cycle += 1) {
      pick(genomics())
      pick(ecology())
      pick(genomics())
      expect(draft.entities).toEqual(applyProfile(start, genomics(), first).entities)
      // Picking the current profile again changes nothing.
      expect(applyProfile(draft, genomics(), first, first)).toEqual(draft)
      pick()
      expect(draft.entities).toEqual(start.entities)
    }
  })
})
