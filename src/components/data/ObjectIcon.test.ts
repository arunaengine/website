import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import ObjectIcon from './ObjectIcon.vue'

const render = (name: string, folder = false) => renderToString(createSSRApp(ObjectIcon, { name, folder }))

describe('object icon', () => {
  it('names the kind in the tooltip and keeps files neutral', async () => {
    const html = await render('genome.faa')
    expect(html).toContain('title="protein sequences"')
    expect(html).toContain('lucide-dna')
    expect(html).toContain('text-muted-foreground')
    expect(await render('genome.gff3')).toContain('title="GFF3 annotation"')
    expect(await render('genome.tsv')).toContain('lucide-file-spreadsheet')
  })

  it('keeps the kind of a compressed sequence', async () => {
    expect(await render('reads.fastq.gz')).toContain('title="compressed sequencing reads"')
    expect(await render('bundle.tar.gz')).toContain('title="archive"')
  })

  it('shows folders in the site blue', async () => {
    const html = await render('plots', true)
    expect(html).toContain('title="folder"')
    expect(html).toContain('text-primary')
  })
})
