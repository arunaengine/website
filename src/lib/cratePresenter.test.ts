import { describe, expect, it } from 'vitest'
import { presentCrate, prettifyKey, type PresentedEntity, type PresentedField } from './cratePresenter'
import type { ProfileEntityRule, ProfilePropertyRule } from './profiles/types'

const ARUNA_USER = `01ARZ3NDEKTSV4RRFFQ69G5FAV@${'A'.repeat(43)}`

function crate(rootExtra: Record<string, unknown>, entities: Array<Record<string, unknown>> = []) {
  return {
    '@context': 'https://w3id.org/ro/crate/1.2/context',
    '@graph': [
      { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', about: { '@id': './' } },
      { '@id': './', '@type': 'Dataset', name: 'Root', ...rootExtra },
      ...entities,
    ],
  }
}

function rule(valueName: string, label: string, description = ''): ProfilePropertyRule {
  return {
    id: valueName,
    label,
    description,
    kind: 'text',
    propertyUri: `http://schema.org/${valueName}`,
    valueName,
    obligation: 'MAY',
  }
}

const MIXS_PROFILE: ProfileEntityRule[] = [
  {
    id: 'dataset',
    label: 'MIMAG Dataset',
    description: '',
    type: 'http://schema.org/Dataset',
    className: 'Dataset',
    propertyRules: [rule('name', 'Title'), rule('depth', 'Depth'), rule('elev', 'Elevation', 'Height above sea level')],
  },
  {
    id: 'sample',
    label: 'MIxS Sample',
    description: '',
    type: 'https://w3id.org/mixs#Sample',
    className: 'Sample',
    propertyRules: [
      rule('samp_name', 'Sample name'),
      rule('geo_loc_name', 'Geographic location'),
      rule('collection_date', 'Collection date'),
    ],
  },
]

function contextById(entities: PresentedEntity[], id: string): PresentedEntity | undefined {
  return entities.find((entity) => entity.id === id)
}

function fieldByKey(fields: PresentedField[], key: string): PresentedField | undefined {
  return fields.find((field) => field.key === key)
}

describe('presentCrate', () => {
  it('labels profiled fields', () => {
    // Profile order first, then unknown fields alphabetical with pretty keys.
    const result = presentCrate(
      crate({ mainEntity: { '@id': '#sample1' } }, [
        {
          '@id': '#sample1',
          '@type': 'Sample',
          name: 'Soil sample A',
          ph: 7.2,
          custom_thing: 'x',
          collection_date: '2026-03-05',
          geo_loc_name: 'Germany: Giessen',
          samp_name: 'Soil A',
        },
      ]),
      { profile: MIXS_PROFILE },
    )
    const sample = contextById(result.entities, '#sample1')
    expect(sample?.name).toBe('Soil sample A')
    expect(sample?.profileLabel).toBe('MIxS Sample')
    expect(sample?.relations).toEqual(['Main entity'])
    expect(sample?.fields.map((field) => field.label)).toEqual([
      'Sample name',
      'Geographic location',
      'Collection date',
      'Custom thing',
      'Ph',
    ])
    expect(sample?.fields.map((field) => field.profiled)).toEqual([true, true, true, false, false])
    const date = fieldByKey(sample?.fields ?? [], 'collection_date')
    expect(date?.values[0]).toEqual({ text: 'Mar 5, 2026', title: '2026-03-05' })
  })

  it('claims hero entities', () => {
    // License and conformsTo stay in the hero; the author also earns a card.
    const result = presentCrate(
      crate(
        {
          author: { '@id': '#p1' },
          license: { '@id': 'https://spdx.org/licenses/MIT' },
          conformsTo: { '@id': 'https://example.org/profile' },
        },
        [
          { '@id': '#p1', '@type': 'Person', name: 'Ann Author' },
          { '@id': 'https://spdx.org/licenses/MIT', '@type': 'CreativeWork', name: 'MIT License' },
          { '@id': 'https://example.org/profile', '@type': 'CreativeWork', name: 'A profile' },
        ],
      ),
    )
    expect(result.people.map((row) => [row.id, row.roles])).toEqual([['#p1', ['Author']]])
    expect(result.organizations).toEqual([])
    expect(result.entities).toEqual([])
    expect(fieldByKey(result.fields, 'license')).toBeUndefined()
    expect(fieldByKey(result.fields, 'author')).toBeUndefined()
  })

  it('merges shared roles', () => {
    // One person in two root roles stays one card carrying both.
    const result = presentCrate(
      crate({ author: { '@id': '#p1' }, maintainer: { '@id': '#p1' } }, [
        { '@id': '#p1', '@type': 'Person', name: 'Ann Author' },
      ]),
    )
    expect(result.people.map((row) => [row.name, row.roles])).toEqual([['Ann Author', ['Author', 'Maintainer']]])
    expect(result.organizations).toEqual([])
  })

  it('files organization authors', () => {
    const result = presentCrate(
      crate({ author: { '@id': '#lab' } }, [{ '@id': '#lab', '@type': 'Organization', name: 'Example Lab' }]),
    )
    expect(result.people).toEqual([])
    expect(result.organizations.map((row) => [row.name, row.roles])).toEqual([['Example Lab', ['Author']]])
  })

  it('claims related refs', () => {
    const result = presentCrate(
      crate({ citation: { '@id': 'https://doi.org/10.5555/x' }, mentions: { '@id': '#other' } }, [
        { '@id': 'https://doi.org/10.5555/x', '@type': 'ScholarlyArticle', name: 'A cited paper' },
        { '@id': '#other', '@type': 'CreativeWork', name: 'Internal note' },
      ]),
    )
    expect(contextById(result.entities, 'https://doi.org/10.5555/x')).toBeUndefined()
    // Fragment mentions stay internal and keep their context block.
    expect(contextById(result.entities, '#other')).toBeDefined()
    expect(fieldByKey(result.fields, 'citation')).toBeUndefined()
  })

  it('keeps role cards', () => {
    const result = presentCrate(
      crate({ publisher: { '@id': '#org' }, funder: { '@id': '#ghost-funder' } }, [
        { '@id': '#org', '@type': 'Organization', name: 'Example Lab' },
      ]),
    )
    expect(result.organizations.map((row) => row.id)).toEqual(['#org', '#ghost-funder'])
    expect(result.organizations[0]?.roles).toEqual(['Publisher'])
    expect(result.organizations[1]?.roles).toEqual(['Funder'])
    expect(result.organizations[1]?.unresolved).toBe(true)
    expect(fieldByKey(result.fields, 'publisher')).toBeUndefined()
  })

  it('splits people orgs', () => {
    const result = presentCrate(
      crate({}, [
        { '@id': '#p1', '@type': 'Person', givenName: 'Toni', familyName: 'Tester' },
        { '@id': '#org', '@type': 'Organization', name: 'A lab' },
      ]),
    )
    expect(result.people.map((row) => row.name)).toEqual(['Toni Tester'])
    expect(result.organizations.map((row) => row.name)).toEqual(['A lab'])
  })

  it('classifies compact and full-IRI research organizations as organization cards', () => {
    const result = presentCrate(
      crate({}, [
        { '@id': '#compact-lab', '@type': 'ResearchOrganization', name: 'Compact Lab' },
        { '@id': '#iri-lab', '@type': 'https://schema.org/ResearchOrganization', name: 'IRI Lab' },
      ]),
    )
    expect(result.organizations.map((row) => row.name)).toEqual(['Compact Lab', 'IRI Lab'])
    expect(result.entities).toEqual([])
  })

  it('detects identifiers', () => {
    const result = presentCrate(
      crate({}, [
        {
          '@id': 'https://orcid.org/0000-0002-1825-0097',
          '@type': 'Person',
          name: 'Josiah Carberry',
          identifier: [ARUNA_USER],
          affiliation: { '@id': 'https://ror.org/05f950310' },
          email: 'mailto:josiah@example.org',
        },
        {
          '@id': 'https://ror.org/05f950310',
          '@type': 'Organization',
          name: 'Example University',
        },
      ]),
    )
    const person = result.people[0]
    expect(person?.orcid).toBe('0000-0002-1825-0097')
    expect(person?.userId).toBe(ARUNA_USER)
    expect(person?.email).toBe('josiah@example.org')
    expect(person?.affiliations).toEqual([{ id: 'https://ror.org/05f950310', name: 'Example University' }])
    expect(result.organizations[0]?.ror).toBe('05f950310')
  })

  it('derives property values', () => {
    // PropertyValue rows surface as labeled fields, never as standalone blocks.
    const result = presentCrate(
      crate({ identifier: [{ '@id': '#pv-ph' }, 'https://doi.org/10.5555/y'] }, [
        { '@id': '#pv-ph', '@type': 'PropertyValue', propertyID: 'ph', value: '7.4', unitText: 'pH' },
        {
          '@id': '#sample1',
          '@type': 'Sample',
          name: 'Soil',
          additionalProperty: { '@type': 'PropertyValue', name: 'Depth', propertyID: 'depth', value: '2.5', unitText: 'm' },
        },
      ]),
    )
    expect(fieldByKey(result.fields, 'ph')?.values[0]?.text).toBe('7.4 pH')
    expect(fieldByKey(result.fields, 'identifier')?.values[0]).toEqual({
      text: 'https://doi.org/10.5555/y',
      href: 'https://doi.org/10.5555/y',
    })
    expect(contextById(result.entities, '#pv-ph')).toBeUndefined()
    const sample = contextById(result.entities, '#sample1')
    expect(fieldByKey(sample?.fields ?? [], 'depth')?.values[0]?.text).toBe('2.5 m')
    expect(fieldByKey(sample?.fields ?? [], 'depth')?.label).toBe('Depth')
  })

  it('links entity refs', () => {
    const result = presentCrate(
      crate({}, [
        { '@id': '#sample1', '@type': 'Sample', name: 'Soil', location: { '@id': '#place' }, seeAlso: { '@id': 'javascript:alert(1)' } },
        { '@id': '#place', '@type': 'Place', name: 'Giessen' },
      ]),
    )
    const sample = contextById(result.entities, '#sample1')
    expect(fieldByKey(sample?.fields ?? [], 'location')?.values[0]).toEqual({
      text: 'Giessen',
      jumpId: '#place',
      title: '#place',
    })
    // A hostile @id must never become a link target.
    const hostile = fieldByKey(sample?.fields ?? [], 'seeAlso')?.values[0]
    expect(hostile?.href).toBeUndefined()
    expect(hostile?.jumpId).toBeUndefined()
  })

  it('keeps comment entries', () => {
    const result = presentCrate(
      crate({}, [
        {
          '@id': 'comment://abc',
          '@type': 'Comment',
          text: 'Looks good to me.',
          dateCreated: '2026-07-01T12:00:00Z',
          author: { '@id': '#p1' },
        },
        { '@id': '#p1', '@type': 'Person', givenName: 'Toni', familyName: 'Tester' },
      ]),
    )
    expect(result.comments).toEqual([
      { id: 'comment://abc', text: 'Looks good to me.', authorName: 'Toni Tester', created: '2026-07-01T12:00:00Z' },
    ])
  })

  it('excludes given ids', () => {
    const result = presentCrate(
      crate({ hasPart: { '@id': 'https://w3id.org/aruna/01ARZ3NDEKTSV4RRFFQ69G5FAV' } }, [
        { '@id': 'https://w3id.org/aruna/01ARZ3NDEKTSV4RRFFQ69G5FAV', '@type': 'CreativeWork', name: 'Child crate' },
        { '@id': '#kept', '@type': 'Thing', name: 'Kept thing' },
      ]),
      { excludeIds: new Set(['https://w3id.org/aruna/01ARZ3NDEKTSV4RRFFQ69G5FAV']) },
    )
    expect(contextById(result.entities, 'https://w3id.org/aruna/01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBeUndefined()
    expect(contextById(result.entities, '#kept')).toBeDefined()
  })

  it('skips data entities', () => {
    const result = presentCrate(
      crate({}, [
        { '@id': 'data.csv', '@type': 'File', name: 'data.csv' },
        { '@id': 'img.png', '@type': ['File', 'MediaObject'], name: 'img.png' },
        { '@id': 'photo.png', '@type': 'ImageObject', name: 'photo.png' },
        { '@id': 'audio.ogg', '@type': 'https://schema.org/AudioObject', name: 'audio.ogg' },
        { '@id': 'sub/', '@type': 'Dataset', name: 'a dataset' },
        { '@id': '#term', '@type': 'DefinedTerm', name: 'a term' },
      ]),
    )
    expect(result.entities.map((entity) => entity.id)).toEqual(['#term'])
    expect(result.entities[0]?.kind).toBe('terms')
  })

  it('builds root fields', () => {
    const result = presentCrate(
      crate({
        name: 'Root',
        description: 'In the hero.',
        keywords: ['a', 'b'],
        datePublished: '2026-01-15',
        version: '1.2',
        url: 'https://example.org/dataset',
        temporalCoverage: '2024/2025',
      }),
      { profile: MIXS_PROFILE },
    )
    expect(fieldByKey(result.fields, 'name')).toBeUndefined()
    expect(fieldByKey(result.fields, 'keywords')).toBeUndefined()
    expect(fieldByKey(result.fields, 'datePublished')?.values[0]).toEqual({ text: 'Jan 15, 2026', title: '2026-01-15' })
    expect(fieldByKey(result.fields, 'url')?.values[0]?.href).toBe('https://example.org/dataset')
    // Unprofiled root fields sort alphabetically by label.
    expect(result.fields.map((field) => field.key)).toEqual(['datePublished', 'temporalCoverage', 'url', 'version'])
  })

  it('formats long text', () => {
    const long = 'x'.repeat(300)
    const result = presentCrate(crate({}, [{ '@id': '#e', '@type': 'Thing', name: 'E', comment: long }]))
    const entity = contextById(result.entities, '#e')
    expect(fieldByKey(entity?.fields ?? [], 'comment')?.values[0]?.long).toBe(true)
  })

  it('collapses url prose', () => {
    // URL parsing tolerates spaces, so prose merely starting with a URL, and any
    // over-long value, must collapse instead of becoming one giant link chip.
    const prose = `https://example.com/data ${'word '.repeat(80)}`.trim()
    const result = presentCrate(
      crate({}, [
        {
          '@id': '#e',
          '@type': 'Thing',
          name: 'E',
          comment: prose,
          url: 'https://example.com/x',
          sameAs: `https://example.com/${'a'.repeat(300)}`,
        },
      ]),
    )
    const fields = contextById(result.entities, '#e')?.fields ?? []
    expect(fieldByKey(fields, 'comment')?.values[0]).toEqual({ text: prose, long: true })
    expect(fieldByKey(fields, 'url')?.values[0]).toEqual({ text: 'https://example.com/x', href: 'https://example.com/x' })
    expect(fieldByKey(fields, 'sameAs')?.values[0]?.href).toBeUndefined()
    expect(fieldByKey(fields, 'sameAs')?.values[0]?.long).toBe(true)
  })

  it('derives shared values once', () => {
    // Two root properties referencing one PropertyValue must not repeat it.
    const result = presentCrate(
      crate({ variableMeasured: { '@id': '#pv' }, subjectOf: { '@id': '#pv' } }, [
        { '@id': '#pv', '@type': 'PropertyValue', propertyID: 'depth', value: '2.5', unitText: 'm' },
      ]),
    )
    expect(fieldByKey(result.fields, 'depth')?.values).toEqual([{ text: '2.5 m' }])
  })

  it('keeps field ids stable', () => {
    // Distinct properties sharing a term tail need distinct ids, and the id must
    // survive a re-presentation so collapse state can key on it.
    const source = crate({ version: '1.2', 'https://schema.org/version': '2.0' })
    const ids = presentCrate(source).fields.map((field) => field.id)
    expect(ids).toEqual(['version', 'https://schema.org/version'])
    expect(presentCrate(structuredClone(source)).fields.map((field) => field.id)).toEqual(ids)
  })

  it('aliases profile types', () => {
    // A className alias over schema.org/Person still routes to the people cards.
    const profile: ProfileEntityRule[] = [
      {
        id: 'author',
        label: 'Author',
        description: '',
        type: 'http://schema.org/Person',
        className: 'Author',
        propertyRules: [rule('name', 'Name')],
      },
    ]
    const result = presentCrate(crate({}, [{ '@id': '#a1', '@type': 'Author', name: 'Aliased Person' }]), { profile })
    expect(result.people.map((row) => row.name)).toEqual(['Aliased Person'])
    expect(result.entities).toEqual([])
  })

  it('hides property values', () => {
    const result = presentCrate(
      crate({}, [
        { '@id': '#field-1', '@type': 'PropertyValue', propertyID: 'ph', value: '7.4' },
        { '@id': '#field-2', '@type': 'PropertyValue', propertyID: 'temp', value: '21' },
      ]),
    )
    expect(result.entities).toEqual([])
    expect(result.people).toEqual([])
  })

  it('drops empty crates', () => {
    expect(presentCrate({})).toEqual({ fields: [], people: [], organizations: [], entities: [], comments: [] })
  })
})

describe('prettifyKey', () => {
  it('splits camel case', () => {
    expect(prettifyKey('sampleName')).toBe('Sample name')
    expect(prettifyKey('contentURL')).toBe('Content URL')
  })

  it('splits snake case', () => {
    expect(prettifyKey('geo_loc_name')).toBe('Geo loc name')
  })

  it('uses uri tails', () => {
    expect(prettifyKey('https://w3id.org/ro/terms/workflow-run#containerImage')).toBe('Container image')
  })

  it('uppercases acronyms', () => {
    expect(prettifyKey('doi')).toBe('DOI')
    expect(prettifyKey('url')).toBe('URL')
    expect(prettifyKey('source_url')).toBe('Source URL')
  })
})
