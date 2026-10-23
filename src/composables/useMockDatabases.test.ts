import { describe, expect, it } from 'vitest'
import { NEW_DATASET, useMockDatabases } from './useMockDatabases'

describe('databases of the node mock', () => {
  // The first test sees the untouched example data; the others change it.
  it('says which datasets a file is part of, live or as of a date', () => {
    const marks = useMockDatabases()
    const bakrep = marks.partOf('bakrep', 'bakrep-v2-data-007/GCF_000005845.2/genome.fna.gz')
    expect(bakrep.map((item) => [item.dataset.name, item.database])).toEqual([
      ['bakrep', true],
      ['E. coli genomes, 2025 release', false],
    ])
    // That dataset also links the RefSeq database, which does not make its files part of it.
    const refseq = marks.partOf('refseq', 'bacteria/GCF_000005845.2_genomic.fna.gz')
    expect(refseq.map((item) => item.dataset.name)).toEqual(['RefSeq'])
    const reef = marks.partOf('lab-raw-data', 'raw/2026/reef-07/notes.txt')
    expect(reef.map((item) => [item.dataset.name, item.part.kind])).toEqual([['Reef survey 2026', 'folder']])
    expect(marks.partOf('lab-raw-data', 'analysis/coverage.tsv')).toEqual([])
  })

  it('keeps a new mark out of the lists until the group admins agree', () => {
    const marks = useMockDatabases()
    marks.add('lab-raw-data', NEW_DATASET)
    const added = marks.all.value.find((entry) => entry.bucket === 'lab-raw-data')!

    expect(added.status).toBe('pending')
    expect(added.dataset.name).toBe('lab-raw-data')
    expect(added.dataset.parts).toEqual([{ kind: 'bucket', bucket: 'lab-raw-data' }])
    expect(marks.entries.value.some((entry) => entry.bucket === 'lab-raw-data')).toBe(false)
    marks.agree(added.id)
    expect(marks.entries.value.some((entry) => entry.bucket === 'lab-raw-data')).toBe(true)
    marks.remove(added.id)
    expect(marks.entries.value.some((entry) => entry.bucket === 'lab-raw-data')).toBe(false)
  })

  it('links an existing dataset to the bucket when it is marked', () => {
    const marks = useMockDatabases()
    const reef = marks.datasets.value.find((dataset) => dataset.name === 'Reef survey 2026')!
    marks.add('lab-raw-data', reef.id)

    expect(marks.datasets.value.find((dataset) => dataset.id === reef.id)!.parts.map((part) => part.kind)).toEqual(['folder', 'bucket'])
    marks.remove(marks.all.value.find((entry) => entry.datasetId === reef.id)!.id)
  })

  it('lists the curators once however often a role is granted', () => {
    const marks = useMockDatabases()
    expect(marks.curators.value.map((role) => role.name)).toEqual(['Database curators'])
    marks.grant({ name: 'Data stewards', users: ['Ana Lopez'] })
    marks.grant({ name: 'Data stewards', users: ['Ana Lopez'] })
    expect(marks.curators.value.map((role) => role.name)).toEqual(['Database curators', 'Data stewards'])
  })
})
