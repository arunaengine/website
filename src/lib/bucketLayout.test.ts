import { describe, expect, it } from 'vitest'
import { bucketLayout, declaredFiles, unlistedFiles } from './bucketLayout'

const T = 'https://w3id.org/aruna/terms/'
const HY = 'http://www.w3.org/ns/hydra/core#'

describe('bucketLayout', () => {
  it('reads the layout templates, their counts and the variables of a whole bucket', () => {
    const crate = {
      '@graph': [
        { '@id': 'bakrep/', '@type': 'Dataset', [`${T}fileCount`]: '43882006', [`${T}layout`]: [{ '@id': '#l0' }, { '@id': '#l1' }], [`${T}variables`]: { '@id': '#v' } },
        { '@id': '#l0', '@type': ['CreativeWork', `${HY}IriTemplate`], additionalType: { '@id': `${T}FolderPattern` }, urlTemplate: '{sample}/', description: 'One folder per sample', [`${T}folderCount`]: '2925467' },
        { '@id': '#l1', '@type': 'CreativeWork', additionalType: { '@id': `${T}FilePattern` }, urlTemplate: '{sample}/{sample}.fna.gz', encodingFormat: 'text/x-fasta', [`${T}fileCount`]: '2925467', contentSize: '8796093022208' },
        { '@id': '#v', [`${HY}variable`]: 'sample', description: 'BioSample accession', [`${T}example`]: 'SAMN00000002' },
      ],
    }
    expect(declaredFiles(crate['@graph'][0])).toBe(43882006)
    expect(bucketLayout(crate)).toEqual({
      rows: [
        { id: '#l0', template: '{sample}/', description: 'One folder per sample', folder: true, format: '', count: 2925467, size: null },
        { id: '#l1', template: '{sample}/{sample}.fna.gz', description: '', folder: false, format: 'text/x-fasta', count: 2925467, size: 8796093022208 },
      ],
      variables: [{ name: 'sample', description: 'BioSample accession', example: 'SAMN00000002' }],
    })
  })

  it('says nothing for a crate without a layout or a count', () => {
    expect(bucketLayout({ '@graph': [{ '@id': './' }] })).toEqual({ rows: [], variables: [] })
    expect(declaredFiles({ '@id': 'a/' })).toBeNull()
  })

  it('counts the files a top folder declares beyond those it lists', () => {
    const crate = {
      '@graph': [
        { '@id': 'ro-crate-metadata.json', about: { '@id': './' } },
        { '@id': './', hasPart: [{ '@id': 'db/' }, { '@id': 'b/' }, { '@id': 'x.txt' }] },
        { '@id': 'db/', '@type': 'Dataset', [`${T}fileCount`]: 70, hasPart: [{ '@id': 'db/a' }, { '@id': 'db/s/' }] },
        { '@id': 'db/a', '@type': 'File' },
        { '@id': 'db/s/', '@type': 'Dataset', hasPart: { '@id': 'db/s/b' } },
        { '@id': 'db/s/b', '@type': 'File' },
        { '@id': 'b/', '@type': 'Dataset', fileCount: '5' },
        { '@id': 'x.txt', '@type': 'File' },
      ],
    }
    expect(unlistedFiles(crate)).toBe(68 + 5)
  })
})
