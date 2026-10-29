import { describe, expect, it } from 'vitest'
import type { ObjectSearchHit } from './api'
import { groupFiles, groupHits, groupTitle } from './searchGroups'

const ECOLI = { organism_name: 'Escherichia coli str. K-12 substr. MG1655', infraspecific_name: 'strain=K-12 substr. MG1655', assembly_accession: 'GCF_000005845.2', assembly_level: 'Complete Genome' }
const hit = (key: string, metadata?: Record<string, string>, node = 'n1'): ObjectSearchHit =>
  ({ kind: 'object', mode: 'local', issuer_node_id: node, group_id: 'g', bucket: 'ncbi-refseq', key, ...(metadata ? { metadata } : {}) })

describe('whole-bucket search groups', () => {
  it('folds the files of one assembly folder into one row, at the place of its first hit', () => {
    const rows = groupHits([
      hit('README.txt', { note: 'x' }),
      hit('GCF_000005845.2_ASM584v2/', ECOLI),
      hit('GCF_000005845.2_ASM584v2/GCF_000005845.2_ASM584v2_genomic.fna.gz', ECOLI),
      hit('notes/plain.txt'),
      hit('GCF_000005845.2_ASM584v2/GCF_000005845.2_ASM584v2_ani_report.txt', ECOLI),
    ])
    expect(rows.map((row) => (row.kind === 'group' ? `group ${row.folder} ${row.hits.length}` : `hit ${row.hit.key}`))).toEqual([
      'hit README.txt',
      'group GCF_000005845.2_ASM584v2 3',
      'hit notes/plain.txt',
    ])
    const group = rows[1] as Extract<(typeof rows)[number], { kind: 'group' }>
    expect(groupFiles(group).map((file) => file.key.split('/').pop())).toEqual(['GCF_000005845.2_ASM584v2_genomic.fna.gz', 'GCF_000005845.2_ASM584v2_ani_report.txt'])
  })

  it('keeps the rows of loaded pages in place and appends a later page to its group', () => {
    const first = [hit('A/a1', ECOLI), hit('B/b1', ECOLI)]
    const before = groupHits(first).map((row) => row.key)
    const after = groupHits([...first, hit('A/a2', ECOLI), hit('C/c1', ECOLI)])
    expect(after.map((row) => row.key)).toEqual([...before, 'n1/C/'])
    expect(after[0].kind === 'group' && after[0].hits.map((entry) => entry.key)).toEqual(['A/a1', 'A/a2'])
  })

  it('keeps folders of different nodes apart', () => {
    expect(groupHits([hit('A/a1', ECOLI, 'n1'), hit('A/a1', ECOLI, 'n2')])).toHaveLength(2)
  })

  it('titles a group by organism and strain once, else by its folder', () => {
    const [group] = groupHits([hit('A/a1', ECOLI)])
    expect(groupTitle(group as never)).toBe('Escherichia coli str. K-12 substr. MG1655')
    const [strain] = groupHits([hit('B/b1', { organism_name: 'Escherichia coli', infraspecific_name: 'strain=O157:H7' })])
    expect(groupTitle(strain as never)).toBe('Escherichia coli O157:H7')
    const [bare] = groupHits([hit('C/c1', { assembly_level: 'Contig' })])
    expect(groupTitle(bare as never)).toBe('C')
  })

  it('appends only the rest of a strain whose first word ends the organism name', () => {
    const [sakai] = groupHits([hit('D/', { organism_name: 'Escherichia coli O157:H7 str. Sakai', infraspecific_name: 'strain=Sakai substr. RIMD 0509952' })])
    expect(groupTitle(sakai as never)).toBe('Escherichia coli O157:H7 str. Sakai substr. RIMD 0509952')
    const [same] = groupHits([hit('E/', { organism_name: 'Escherichia coli O157:H7 str. EDL933', infraspecific_name: 'strain=EDL933' })])
    expect(groupTitle(same as never)).toBe('Escherichia coli O157:H7 str. EDL933')
  })

  it('counts no file for a group of only the folder entry', () => {
    const [folder] = groupHits([hit('D/', { organism_name: 'Escherichia coli O157:H7 str. Sakai' })])
    expect(folder.kind).toBe('group')
    expect(groupFiles(folder as never)).toEqual([])
  })
})
