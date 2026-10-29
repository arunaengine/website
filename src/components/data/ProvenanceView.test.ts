import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type OriginResponse } from '@/lib/api'
import * as Provenance from '@/lib/provenance'
import { button, click, compileClientComponent, content, flush, mountApp, moduleDefault, nodes } from '@/test/clientRender'

const aruna = vi.hoisted(() => ({
  getVersionOrigin: vi.fn(),
  getRun: vi.fn(),
  fetchRoCrateRaw: vi.fn(),
  downloadProvenanceCrate: vi.fn(),
  runSparql: vi.fn(),
  sessionEpoch: { value: 1 },
}))

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })

const component = compileClientComponent(new URL('./ProvenanceView.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/ExternalLink.vue': { __esModule: true, default: defineComponent({ props: { href: String, label: String }, setup: (props) => () => h('a', { href: props.href }, props.label) }) },
  '@lucide/vue': { ArrowLeft: defineComponent(() => () => h('i')) },
  'vue-router': { RouterLink: defineComponent((_, { slots }) => () => h('a', slots.default?.())) },
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/composables/useAruna': { useAruna: () => aruna },
  '@/composables/useDatabases': { useDatabases: () => ({ rows: ref([]) }) },
  '@/lib/api': { apiErrorMessage: (cause: unknown) => (cause as Error).message },
  '@/lib/provenance': Provenance,
})

const START = 'https://w3id.org/aruna/data/arn:aruna:r:n:s3/lab/out.tsv@01K8W1B3D5F7H9KMQ1S3V5X7Z1'
const INPUT = 'https://w3id.org/aruna/data/arn:aruna:r:n:s3/lab/in.faa@01K8W1B3D5F7H9KMQ1S3V5X7Z2'
const origin = (extra: Partial<OriginResponse>): OriginResponse => ({ version_id: 'v', created_by: 'u', created_at: '2026-10-20T10:00:00Z', projection: [], ...extra })
const crate = {
  '@graph': [
    { '@id': '#run', '@type': 'CreateAction', name: 'Genome annotation', object: [{ '@id': 's3://lab/in.faa' }, { '@id': 's3://lab/c.yaml' }] },
    { '@id': 's3://lab/in.faa', '@type': 'File', name: 'in.faa', contentUrl: ['s3://lab/in.faa', INPUT] },
    { '@id': 's3://lab/c.yaml', '@type': 'File', name: 'c.yaml', contentUrl: 's3://lab/c.yaml' },
  ],
}

async function render(extra: Partial<OriginResponse> = {}) {
  const start = { kind: 'file', id: START, name: 'out.tsv', origin: origin({ origin: { kind: 'job', run_id: 'r1' }, ...extra }) }
  const { root } = await mountApp(component, { props: { start } })
  return root
}

describe('provenance view', () => {
  beforeEach(() => {
    aruna.getRun.mockReset().mockResolvedValue({ run_id: 'r1', run_crate: 'doc1' })
    aruna.fetchRoCrateRaw.mockReset().mockResolvedValue(crate)
    aruna.getVersionOrigin.mockReset().mockRejectedValue(new ApiError(403, 'forbidden'))
    aruna.downloadProvenanceCrate.mockReset().mockResolvedValue(new Blob(['zip']))
    aruna.runSparql.mockReset()
  })

  it('reads nothing until asked, then one link at a time', async () => {
    const root = await render()
    expect(content(root)).toContain('This file')
    expect(aruna.getRun).not.toHaveBeenCalled()

    await click(button(root, 'Show where this came from'))
    await flush()
    expect(content(root)).toContain('Genome annotation')
    expect(content(root)).toContain('No exact version recorded')
    expect(aruna.getVersionOrigin).not.toHaveBeenCalled()
  })

  it('shows all links and marks the ones the user cannot read', async () => {
    const root = await render()
    await click(button(root, 'Show all'))
    await vi.waitFor(() => expect(content(root)).toContain('Not visible to you'))

    expect(aruna.getVersionOrigin).toHaveBeenCalledWith(INPUT)
    expect(content(root)).not.toContain('in.faa')
  })

  it('exports the crate of the start version', async () => {
    const created: unknown[] = []
    vi.stubGlobal('document', { body: { append: (node: unknown) => created.push(node) }, createElement: () => ({ click: vi.fn(), remove: vi.fn() }) })
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: vi.fn() }))
    const root = await render()
    await click(button(root, 'Export as crate'))
    vi.unstubAllGlobals()

    expect(aruna.downloadProvenanceCrate).toHaveBeenCalledWith({ version: START })
    expect(created).toEqual([expect.objectContaining({ download: 'provenance.zip' })])
  })

  it('finds runs and datasets of the same bytes on request', async () => {
    aruna.runSparql
      .mockResolvedValueOnce({ rows: [{ s: 'https://w3id.org/aruna/01K8W1B3D5F7H9KMQ1S3V5X7Z9#run-1' }] })
      .mockResolvedValueOnce({ rows: [] })
    const root = await render({ content_id: `https://w3id.org/aruna/data/${'a'.repeat(64)}` })
    expect(aruna.runSparql).not.toHaveBeenCalled()

    await click(button(root, 'Find runs and datasets'))
    await vi.waitFor(() => expect(content(root)).toContain('Used by 1 run'))
    expect(content(root)).toContain('Part of 0 datasets')
    expect(content(root)).toContain('not this exact version')
  })

  it('forgets where the previous file went when another file opens', async () => {
    aruna.runSparql.mockResolvedValue({ rows: [{ s: 'https://w3id.org/aruna/01K8W1B3D5F7H9KMQ1S3V5X7Z9#run-1' }] })
    const contentId = `https://w3id.org/aruna/data/${'a'.repeat(64)}`
    const start = ref({ kind: 'file', id: START, name: 'out.tsv', origin: origin({ origin: { kind: 'job', run_id: 'r1' }, content_id: contentId }) })
    const Host = defineComponent(() => () => h(component, { start: start.value }))
    const { root } = await mountApp(Host)
    await click(button(root, 'Find runs and datasets'))
    await vi.waitFor(() => expect(content(root)).toContain('Used by 1 run'))

    start.value = { ...start.value, id: INPUT, name: 'in.faa' }
    await flush()
    expect(content(root)).not.toContain('Used by 1 run')
    expect(content(root)).toContain('Find runs and datasets')
  })

  it('says when a file has no content id to search by', async () => {
    expect(content(await render())).toContain('Not available for this file.')
  })

  it('folds the files of one database release and shows their chain once', async () => {
    const version = (key: string, index: number) => `https://w3id.org/aruna/data/arn:aruna:r:n2:s3/bakta-db/${key}@01K8W1B3D5F7H9KMQ1S3V${String(index).padStart(5, '0')}`
    const files = Array.from({ length: 66 }, (_, index) => ({ '@id': `s3://bakta-db/db/f${index}`, '@type': 'File', name: `/work/in/db/f${index}`, contentUrl: [`s3://bakta-db/db/f${index}`, version(`db/f${index}`, index)] }))
    const genome = 'https://w3id.org/aruna/data/arn:aruna:r:n2:s3/laptop/genome.fasta@01K8W1B3D5F7H9KMQ1S3V5X7Z9'
    const tarball = 'https://w3id.org/aruna/data/arn:aruna:r:n2:s3/bakta-db/db-light.tar.xz@01K8W1B3D5F7H9KMQ1S3V5X7Z8'
    aruna.getRun.mockImplementation(async (runId: string) => ({ run_id: runId, run_crate: runId }))
    aruna.fetchRoCrateRaw.mockImplementation(async (doc: string) => doc === 'r1'
      ? { '@graph': [{ '@id': '#run', '@type': 'CreateAction', name: 'Bakta', object: [{ '@id': 'genome' }, ...files.map((file) => ({ '@id': file['@id'] }))] }, { '@id': 'genome', '@type': 'File', name: 'work/in/genome.fasta', contentUrl: ['s3://laptop/genome.fasta', genome] }, ...files] }
      : { '@graph': [{ '@id': '#prep', '@type': 'CreateAction', name: 'Prepare Bakta DB 6.0 light', object: [{ '@id': 'tar' }] }, { '@id': 'tar', '@type': 'File', name: 'db-light.tar.xz', contentUrl: ['s3://bakta-db/db-light.tar.xz', tarball] }] })
    aruna.getVersionOrigin.mockImplementation(async (id: string) => {
      if (id === genome) return origin({ origin: { kind: 'upload' } as never })
      if (id === tarball) return origin({ origin: { kind: 'source' } as never, source: { url: 'https://zenodo.org/records/14916843' } as never })
      return origin({
        origin: { kind: 'job', run_id: 'prep' },
        bucket_metadata: { database: true, title: 'Bakta database (light)' } as never,
        releases: [{ crate_version: 'cv-6', label: '6.0 light', upstream: [{ name: 'DOI', value: '10.5281/zenodo.14916843', url: 'https://doi.org/10.5281/zenodo.14916843' }] }] as never,
      })
    })
    const root = await render()
    await click(button(root, 'Show all'))
    await flush()
    const text = content(root)

    expect(text).toContain('66 files of Bakta database (light) 6.0 light')
    expect(text).toContain('genome.fasta')
    expect(text).not.toContain('work/in/genome.fasta')
    expect(nodes(root).some((node) => node.props.title === 'work/in/genome.fasta')).toBe(true)
    expect(text.split('Database release')).toHaveLength(2)
    expect(text.split('Prepare Bakta DB 6.0 light')).toHaveLength(2)
    expect(text).toContain('zenodo.org')
    expect(text).not.toContain('/work/in/db/f3')
    // Seven columns of 128 px boxes and 20 px arrows stay within 1110 px, the width at 1440 px.
    expect(nodes(root).some((node) => String(node.props.class).split(' ').includes('w-32'))).toBe(true)
    expect(nodes(root).some((node) => String(node.props.class).split(' ').includes('w-5'))).toBe(true)
    const doi = nodes(root).find((node) => node.tag === 'a' && node.props.href === 'https://doi.org/10.5281/zenodo.14916843')
    // Words wrap at spaces; only unbroken identifiers break, never "Open the sourc" + "e".
    expect(String(doi?.props.class)).toContain('[overflow-wrap:anywhere]')
    expect(nodes(root).some((node) => String(node.props.class).split(' ').includes('break-all'))).toBe(false)

    await click(button(root, 'Show the files'))
    expect(content(root)).toContain('/work/in/db/f3')
  })

  it('draws folded files reached a second time without their sources again', async () => {
    const exact = (key: string, tail: string) => `https://w3id.org/aruna/data/arn:aruna:r:n2:s3/db/${key}@01K8W1B3D5F7H9KMQ1S3V5X${tail}`
    const dbFiles = ['a', 'b'].map((key, index) => ({ '@id': `s3://db/${key}`, '@type': 'MediaObject', name: key, contentUrl: [`s3://db/${key}`, exact(key, `00${index}`)] }))
    const result = { '@id': 's3://db/out', '@type': 'MediaObject', name: 'out', contentUrl: ['s3://db/out', exact('out', '009')] }
    aruna.getRun.mockImplementation(async (runId: string) => ({ run_id: runId, run_crate: runId }))
    aruna.fetchRoCrateRaw.mockImplementation(async (doc: string) => doc === 'r1'
      ? { '@graph': [{ '@id': '#run', '@type': 'CreateAction', name: 'Bakta', object: dbFiles.map((file) => ({ '@id': file['@id'] })) }, ...dbFiles] }
      : { '@graph': [{ '@id': '#prep', '@type': 'CreateAction', name: 'Prepare' }] })
    aruna.getVersionOrigin.mockImplementation(async (id: string) => origin({
      origin: { kind: 'job', run_id: id.includes('/out@') ? 'r1' : 'prep' },
      ...(id.includes('/out@') ? {} : { bucket_metadata: { database: true, title: 'Bakta database (light)' } as never, releases: [{ crate_version: 'cv', label: '6.0 light', upstream: [] }] as never }),
    }))
    const start = { kind: 'dataset', documentId: '01M63099Q2000108CB51QQDB2P', title: 'Bakta run', crate: { '@graph': [...dbFiles, result] } }
    const { root } = await mountApp(component, { props: { start } })
    await click(button(root, 'Show all'))
    await flush()
    const text = content(root)

    expect(text.split('2 files of Bakta database (light) 6.0 light')).toHaveLength(3)
    expect(text).toContain('Where these came from is shown above.')
    expect(text.split('Database release')).toHaveLength(2)
  })
})

