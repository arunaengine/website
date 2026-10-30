import { describe, expect, it } from 'vitest'
import { aboutFacts } from './datasetAbout'
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
