import { describe, expect, it } from 'vitest'
import { aboutFacts, bylineOf, citationText, referencesTo } from './datasetAbout'
import { formatDate } from './utils'

describe('aboutFacts', () => {
  it('reads dates, binary size, listed files and identifier links from the root', () => {
    const crate = {
      '@graph': [
        { '@id': 'ro-crate-metadata.json', about: { '@id': './' } },
        {
          '@id': './',
          datePublished: '2026-10-29',
          contentSize: '3758096384',
          identifier: ['doi:10.5281/zenodo.14916843', { '@id': '#pv' }, 'https://example.org/record/1', 'local-7'],
        },
        { '@id': '#pv', '@type': 'PropertyValue', value: 'https://doi.org/10.1099/mgen.0.001305' },
        { '@id': 'a.txt', '@type': 'File' },
        { '@id': 'b.txt', '@type': ['File', 'SoftwareSourceCode'] },
        { '@id': 'db/', '@type': 'Dataset' },
      ],
    }
    expect(aboutFacts(crate)).toEqual({
      published: formatDate('2026-10-29T12:00:00'),
      modified: '',
      size: '3.5 GiB',
      files: 2,
      identifiers: [
        { text: 'doi.org/10.5281/zenodo.14916843', href: 'https://doi.org/10.5281/zenodo.14916843' },
        { text: 'doi.org/10.1099/mgen.0.001305', href: 'https://doi.org/10.1099/mgen.0.001305' },
        { text: 'example.org/record/1', href: 'https://example.org/record/1' },
        { text: 'local-7' },
      ],
      doi: 'https://doi.org/10.5281/zenodo.14916843',
    })
  })

  it('keeps an unreadable date and size as written and reports nothing for an empty crate', () => {
    const crate = { '@graph': [{ '@id': './', datePublished: 'spring 2020', contentSize: 'about 2 GB' }] }
    expect(aboutFacts(crate)).toMatchObject({ published: 'spring 2020', size: 'about 2 GB', files: 0, identifiers: [] })
    expect(aboutFacts({})).toMatchObject({ published: '', size: '', files: 0 })
  })
})

describe('citationText', () => {
  it('joins the parts and drops the missing ones', () => {
    expect(citationText({ authors: ['Ada Lovelace', 'Alan Turing'], year: '2026', title: 'Reef census.', publisher: 'Demo realm', link: 'https://doi.org/10.1/x' }))
      .toBe('Ada Lovelace, Alan Turing (2026). Reef census. Demo realm. https://doi.org/10.1/x')
    expect(citationText({ authors: [], year: '', title: 'Reef census', publisher: '', link: 'https://example.org/d/1' })).toBe('Reef census. https://example.org/d/1')
  })
})

describe('bylineOf', () => {
  const crate = {
    '@graph': [
      { '@id': 'ro-crate-metadata.json', about: { '@id': './' } },
      { '@id': './', author: [{ '@id': '#ada' }, { '@id': '#ada' }, 'Grace Hopper'], creator: { '@id': '#bob' } },
      { '@id': '#ada', '@type': 'Person', name: 'Ada Lovelace' },
      { '@id': '#run', '@type': 'CreateAction', agent: { '@id': 'https://orcid.org/0000-0001' } },
    ],
  }

  it('names the authors once each, or a run by its agents', () => {
    expect(bylineOf(crate).map((entry) => entry.name)).toEqual(['Ada Lovelace', 'Grace Hopper'])
    expect(bylineOf(crate, { agent: { '@id': 'https://orcid.org/0000-0001' } })).toHaveLength(1)
  })

  it('marks an unnamed Aruna user agent by its user id', () => {
    const user = `01M63KXP71RJ4MJAEDT9ZJ1VXP@${'Q'.repeat(43)}`
    const run = { '@graph': [{ '@id': `#agent-${user}`, '@type': 'Person', identifier: user }] }
    expect(bylineOf(run, { agent: { '@id': `#agent-${user}` } })[0]?.userId).toBe(user)
    expect(bylineOf(crate)[0]?.userId).toBeUndefined()
  })
})

describe('referencesTo', () => {
  it('lists each entity and property that points at the id, never the id itself', () => {
    const crate = {
      '@graph': [
        { '@id': './', name: 'Root', hasPart: [{ '@id': 'a.txt' }], mentions: { '@id': '#run' } },
        { '@id': '#run', '@type': 'CreateAction', object: [{ '@id': 'a.txt' }], result: 'a.txt' },
        { '@id': 'a.txt', '@type': 'File', isBasedOn: { '@id': 'a.txt' } },
      ],
    }
    expect(referencesTo(crate, 'a.txt')).toEqual([
      { id: './', name: 'Root', property: 'Has part' },
      { id: '#run', name: 'run', property: 'Object' },
    ])
  })
})
