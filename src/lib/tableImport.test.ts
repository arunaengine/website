import { describe, expect, it } from 'vitest'
import {
  defaultTemplates, fillTemplate, guessFormat, guessUses, presetUses, PRESETS, previewOf, rowPasses, rowsOf,
  searchQuery, searchTerms, unknownColumns, type ColumnChoice,
} from './tableImport'

const CSV = [
  'sample,url,bytes,md5,collected',
  'S01,https://data.example.org/run1/S01_R1.fastq.gz,1843201977,9e107d9d372bb6826bd81d3542a419d6,2026-03-14',
  'S02,https://data.example.org/run1/S02_R1.fastq.gz,1700000000,e4d909c290d0fb1ca068ffaddf22cbd0,2026-03-15',
].join('\n')

const NCBI = [
  '#   See ftp://ftp.ncbi.nlm.nih.gov/genomes/README_assembly_summary.txt',
  '#assembly_accession\ttaxid\tspecies_taxid\torganism_name\tftp_path\texcluded_from_refseq',
  'GCF_000005845.2\t511145\t562\tEscherichia coli str. K-12 substr. MG1655\thttps://ftp.ncbi.nlm.nih.gov/genomes/all/GCF/000/005/845/GCF_000005845.2_ASM584v2\tna',
].join('\n')

describe('reading a list', () => {
  it('guesses a comma list with names in the first row', () => {
    const format = guessFormat(CSV, 'run1.csv')
    expect(format).toMatchObject({ delimiter: ',', header: 'first_row', comment: null, gzip: null })
    expect(previewOf(CSV, format).columns).toEqual(['sample', 'url', 'bytes', 'md5', 'collected'])
    expect(guessFormat(CSV, 'run1.csv.gz').gzip).toBe(true)
  })

  it('guesses a tab list with names in the last comment line and na as empty', () => {
    const format = guessFormat(NCBI)
    expect(format).toMatchObject({ delimiter: '\t', header: 'last_comment', comment: '#', nulls: ['na', ''] })
    const preview = previewOf(NCBI, format)
    expect(preview.columns[0]).toBe('assembly_accession')
    expect(preview.rows[0][1]).toBe('511145')
  })

  it('reads a header at a given row and typed column names', () => {
    const text = 'title line\na,b\n1,2'
    expect(previewOf(text, { ...guessFormat(text), header: { row: 2 } })).toEqual({ columns: ['a', 'b'], rows: [['1', '2']] })
    expect(previewOf('1,2', { ...guessFormat('1,2'), header: { columns: ['x', 'y'] } })).toEqual({ columns: ['x', 'y'], rows: [['1', '2']] })
  })
})

describe('column uses', () => {
  const preview = previewOf(CSV, guessFormat(CSV))
  const uses = guessUses(preview.columns, preview.rows[0])

  it('finds the path, name, size, checksum and modified time', () => {
    expect(uses.map((choice) => [choice.name, choice.use, choice.algorithm])).toEqual([
      ['sample', 'name', undefined], ['url', 'path', undefined], ['bytes', 'size', undefined],
      ['md5', 'checksum', 'md5'], ['collected', 'modified', undefined],
    ])
    expect(defaultTemplates(uses)).toEqual({ source: '{url}', target: '{sample}/{url|basename}' })
  })

  it('builds the rows of the import from the uses', () => {
    const choices: ColumnChoice[] = uses.map((choice) => (choice.name === 'collected' ? { ...choice, use: 'skip' } : choice))
    choices[0] = { ...choices[0], only: ['S01'] }
    expect(rowsOf(choices, 'file', '{url}', '{sample}/{url|basename}')).toEqual({
      kind: 'file', source: '{url}', target: '{sample}/{url|basename}',
      filter: [{ column: 'sample', any_of: ['S01'] }],
      keep: ['sample', 'url', 'bytes', 'md5'],
      text: [], exact: [],
      size: 'bytes', checksums: [{ algorithm: 'md5', column: 'md5' }],
    })
    expect(rowPasses(choices, preview.columns, preview.rows[0])).toBe(true)
    expect(rowPasses(choices, preview.columns, preview.rows[1])).toBe(false)
  })

  it('keeps every column and maps search and filter uses', () => {
    const choices = presetUses(PRESETS[0], ['ftp_path', 'organism_name', 'taxid', 'notes'])
    choices[1] = { ...choices[1], use: 'search_filter' }
    expect(rowsOf(choices, 'folder', '{ftp_path}', '{ftp_path|basename}')).toMatchObject({
      kind: 'folder', keep: null, text: ['organism_name'], exact: ['organism_name', 'taxid'], filter: [],
    })
  })
})

describe('templates and search', () => {
  it('fills templates and skips rows with an empty value', () => {
    const columns = ['sample', 'url']
    expect(fillTemplate('{sample}/{url|basename}', columns, ['S01', 'https://x.org/a/S01.fq/'])).toBe('S01/S01.fq')
    expect(fillTemplate('{sample}', columns, ['na', 'u'], ['na', ''])).toBeNull()
    expect(unknownColumns('{sample}/{nope|basename}', columns)).toEqual(['nope'])
  })

  it('reads column=value terms and writes them back', () => {
    const terms = searchTerms('coli species_taxid=562 assembly_level="Complete Genome"')
    expect(terms).toEqual({ words: ['coli'], exact: [{ column: 'species_taxid', value: '562' }, { column: 'assembly_level', value: 'Complete Genome' }] })
    expect(searchQuery(terms.words, terms.exact)).toBe('coli species_taxid=562 assembly_level="Complete Genome"')
  })
})
