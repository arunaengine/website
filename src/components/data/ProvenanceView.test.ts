import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type OriginResponse } from '@/lib/api'
import * as FileOrigin from '@/lib/fileOrigin'
import * as Jobs from '@/lib/jobs'
import * as Provenance from '@/lib/provenance'
import { button, click, compileClientComponent, content, flush, mountApp, moduleDefault, nodes } from '@/test/clientRender'

const aruna = vi.hoisted(() => ({
  getVersionOrigin: vi.fn(),
  getRun: vi.fn(),
  getBucketRuns: vi.fn(async () => ({ runs: [] as Array<{ run_id: string }>, complete: true })),
  fetchRoCrateRaw: vi.fn(),
  downloadProvenanceCrate: vi.fn(),
  runSparql: vi.fn(),
  listGroupConnectors: vi.fn(async () => ({ connectors: [{ connector_id: 'c1', name: 'NCBI FTP' }] })),
  myGroups: { value: [{ id: 'g1' }] },
  sessionEpoch: { value: 1 },
}))
const resolveUsers = vi.hoisted(() => vi.fn(async () => []))
const getJob = vi.hoisted(() => vi.fn(async (jobId: string) => ({ job_id: jobId, kind: 'import_rocrate' })))

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })

const component = compileClientComponent(new URL('./ProvenanceView.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/ExternalLink.vue': { __esModule: true, default: defineComponent({ props: { href: String, label: String }, setup: (props) => () => h('a', { href: props.href }, props.label) }) },
  '@lucide/vue': new Proxy({} as Record<string | symbol, unknown>, { get: (icons, name) => (icons[name] ??= defineComponent(() => () => h('i'))) }),
  '@vueuse/core': { useElementSize: () => ({ width: ref(0) }) },
  'vue-router': { RouterLink: defineComponent({ props: { to: Object }, setup: (props, { slots }) => () => h('a', { to: props.to }, slots.default?.()) }) },
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/components/ui/Tooltip.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Spinner.vue': moduleDefault(Slotted('span')),
  '@/components/ui/SectionHeading.vue': moduleDefault(defineComponent({ props: { title: String }, setup: (props, { slots }) => () => h('header', [props.title, slots.actions?.()]) })),
  '@/lib/crate/dataIdentity': { folderRoute: (bucket: string) => ({ name: 'bucket', params: { bucketId: bucket } }), objectRoute: (bucket: string, key: string) => ({ name: 'bucket', params: { bucketId: bucket }, query: { object: key } }) },
  '@/lib/objectListing': { splitName: (name: string) => [name, ''] },
  '@/composables/useAruna': { useAruna: () => aruna },
  '@/composables/useJobs': { useJobs: () => ({ jobsEnabled: { value: true }, getJob }) },
  '@/lib/fileOrigin': FileOrigin,
  '@/lib/jobs': Jobs,
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ displayName: (id: string) => `node ${id}` }) },
  '@/composables/useUserDirectory': { useUserDirectory: () => ({ resolveUsers, cachedUser: (id: string) => (id === 'u' ? { user_id: 'u', name: 'Ada Lovelace' } : null) }) },
  '@/lib/utils': { shortUserId: (id: string) => `user ${id}` },
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

// Opens every closed card in place, one step at a time, until nothing earlier is left.
async function openAll(root: Awaited<ReturnType<typeof render>>) {
  for (;;) {
    await vi.waitFor(() => expect(content(root)).not.toContain('Reading:'))
    const closed = nodes(root).find((node) => node.tag === 'button' && node.props['aria-expanded'] === false && String(node.props['aria-label'] ?? '').startsWith('Show '))
    if (!closed) return
    await click(closed)
  }
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

  it('reads the run and its direct inputs when opened, and links the run to its record', async () => {
    const root = await render()
    await vi.waitFor(() => expect(content(root)).toContain('Not visible to you'))
    expect(content(root)).toContain('This file')
    expect(content(root)).toContain('Genome annotation')
    expect(content(root)).toContain('No exact version recorded')
    expect(aruna.getVersionOrigin).toHaveBeenCalledWith(INPUT)
    expect(content(root)).not.toContain('in.faa')
    const run = nodes(root).find((node) => node.tag === 'a' && content(node).includes('Genome annotation'))
    expect(run?.props.to).toEqual({ name: 'dataset', params: { id: 'doc1' } })
  })

  it('frames an input and its external source with their dataset, until the input is hidden', async () => {
    const source = { url: 'https://example.org/in.faa', path: 'in.faa', digests: [], sources: [{ url: 'https://example.org/in.faa', path: 'in.faa', connector_id: 'c1' }] }
    const database = { bucket_metadata: { database: true, dataset: 'd1' }, description: { title: 'BakRep', identifiers: [] } }
    aruna.getVersionOrigin.mockReset().mockResolvedValue(origin({ origin: { kind: 'source' }, source, ...database }))
    const root = await render()
    await vi.waitFor(() => expect(content(root)).toContain('Connector: NCBI FTP'))
    expect(content(root)).toContain('in.fa')
    expect(content(root)).toContain('Downloaded')
    expect(content(root)).not.toContain('System job')
    expect(aruna.listGroupConnectors).toHaveBeenCalledWith('g1')
    const link = nodes(root).find((node) => node.tag === 'a' && node.props.href === 'https://example.org')
    expect(content(link!)).toBe('example.org')

    // The whole frame title is one link to the dataset, around the source and file columns.
    const frames = () => nodes(root).filter((node) => node.props['data-frame'])
    expect(frames()).toHaveLength(1)
    expect(frames()[0]!.props.style).toMatchObject({ gridColumn: '1 / 4' })
    const title = nodes(frames()[0]!).find((node) => node.tag === 'a')!
    expect(content(title)).toBe('DatasetBakRep')
    expect(title.props.to).toEqual({ name: 'dataset', params: { id: 'd1' } })
    expect(String(title.props.class)).toContain('focus-visible:ring-2')
    expect(content(root)).toContain('Dataset with its source and files')

    // Hiding the run's inputs takes the frame with them.
    const toggle = () => nodes(root).find((node) => node.tag === 'button' && node.props['aria-expanded'] !== undefined)!
    expect(toggle().props['aria-label']).toBe('Hide earlier steps')
    await click(toggle())
    expect(frames()).toHaveLength(0)
    expect(content(root)).not.toContain('BakRep')
    await click(toggle())
    await vi.waitFor(() => expect(frames()).toHaveLength(1))
  })

  it('shows the runs that wrote into the bucket a dataset names, asked on its node', async () => {
    aruna.getRun.mockImplementation(async (runId: string) => ({ run_id: runId, run_crate: runId }))
    aruna.fetchRoCrateRaw.mockImplementation(async () => ({ '@graph': [{ '@id': '#run', '@type': 'CreateAction', name: 'Bakta K-12' }] }))
    aruna.getBucketRuns.mockResolvedValueOnce({ runs: [{ run_id: 'k12' }], complete: true })
    const part = 'arn:aruna:r:n2:s3/bakta-results/'
    const crate = { '@graph': [{ '@id': './', '@type': 'Dataset', hasPart: [{ '@id': part }] }, { '@id': part, '@type': 'Dataset', name: 'bakta-results' }] }
    const { root } = await mountApp(component, { props: { start: { kind: 'dataset', documentId: 'd5', title: 'Bakta annotation results', crate } } })

    await vi.waitFor(() => expect(content(root)).toContain('Bakta K-12'))
    expect(aruna.getBucketRuns).toHaveBeenCalledWith('bakta-results', '', 'n2')
    expect(aruna.getRun).toHaveBeenCalledWith('k12')
  })

  it('names the person and the device an input was uploaded from', async () => {
    aruna.getVersionOrigin.mockReset().mockResolvedValue(origin({ origin: { kind: 'upload', node_id: 'n2', device: 'd1' } }))
    const root = await render()
    await vi.waitFor(() => expect(content(root)).toContain('Uploaded byAda LovelaceFrom device node d1'))
    expect(resolveUsers).toHaveBeenCalledWith(['u'])
    expect(content(root)).toContain('Uploaded by a person')
  })

  it('says which client an upload came through', async () => {
    aruna.getVersionOrigin.mockReset().mockResolvedValue(origin({ origin: { kind: 'upload', node_id: 'n2', client: 's3' } }))
    const root = await render()
    await vi.waitFor(() => expect(content(root)).toContain('Uploaded byAda LovelaceVia S3'))
  })

  it('links a copy to its system job by name, and names who started a run', async () => {
    const OTHER = 'https://w3id.org/aruna/data/arn:aruna:r:n:s3/lab/in.faa@01K8W1B3D5F7H9KMQ1S3V5X7Z3'
    const source = { path: 'in.faa', digests: [], sources: [{ path: 'in.faa', connector_id: 'c9', connector_name: 'Lab archive' }] }
    aruna.getVersionOrigin.mockReset().mockImplementation(async (id: string) =>
      origin(id === INPUT ? { origin: { kind: 'copy', from: OTHER, job_id: 'j1' } } : { origin: { kind: 'source', job_id: 'j0' }, source }))
    aruna.listGroupConnectors.mockClear()
    getJob.mockClear()
    const root = await render({ origin: { kind: 'job', run_id: 'r1', started_by: 'u' } })
    await vi.waitFor(() => expect(content(root)).toContain('Connector: Lab archive'))
    expect(content(root)).toContain('System jobHideImport RO-Crate')
    // A download is an arrow from its source, so its job is not drawn or asked for.
    expect(getJob).toHaveBeenCalledWith('j1')
    expect(getJob).not.toHaveBeenCalledWith('j0')
    const job = nodes(root).find((node) => node.tag === 'a' && content(node) === 'Import RO-Crate')
    expect(job?.props.to).toEqual({ name: 'job', params: { jobId: 'j1' } })
    expect(content(root)).toContain('Connector: Lab archive')
    expect(aruna.listGroupConnectors).not.toHaveBeenCalled()
    expect(content(root)).toContain('Started by Ada Lovelace')
  })

  it('draws the run that made an input one level up, and reads every level on request', async () => {
    const version = (name: string, last: string) => `https://w3id.org/aruna/data/arn:aruna:r:n:s3/lab/${name}@01K8W1B3D5F7H9KMQ1S3V5X7Z${last}`
    const [x, y, z] = [version('x.fa', '3'), version('y.fa', '4'), version('z.fa', '5')]
    const input = (id: string, name: string, exact: string) => ({ '@id': id, '@type': 'File', name, contentUrl: [`s3://lab/${name}`, exact] })
    const runCrate = (name: string, id: string, file: string, exact: string) => ({ '@graph': [{ '@id': '#run', '@type': 'CreateAction', name, object: [{ '@id': id }] }, input(id, file, exact)] })
    aruna.getRun.mockImplementation(async (runId: string) => ({ run_id: runId, run_crate: runId }))
    aruna.fetchRoCrateRaw.mockImplementation(async (doc: string) => (doc === 'b' ? runCrate('Trimming', 'y', 'y.fa', y) : runCrate('Download', 'z', 'z.fa', z)))
    aruna.getVersionOrigin.mockImplementation(async (id: string) => origin({ origin: id === x ? { kind: 'job', run_id: 'b' } : id === y ? { kind: 'job', run_id: 'c' } : ({ kind: 'upload' } as never) }))
    const crate = {
      '@graph': [
        { '@id': '#run-a', '@type': 'CreateAction', name: 'Assembly', object: [{ '@id': 'x' }], result: [{ '@id': 'out' }] },
        input('x', 'x.fa', x),
        { '@id': 'out', '@type': 'File', name: 'out.fa', contentUrl: 's3://lab/out.fa' },
      ],
    }
    const { root } = await mountApp(component, { props: { start: { kind: 'dataset', documentId: 'd1', title: 'Assembly result', crate } } })

    // The closed input still shows the run that made it, closed with its inputs unread.
    await vi.waitFor(() => expect(content(root)).toContain('UpstreamMoreDownload'))
    expect(content(root)).toContain('UpstreamHideTrimming')
    expect(content(root)).toContain('Upstreamy.fa')
    expect(content(root)).not.toContain('Reading')
    expect(aruna.getVersionOrigin).not.toHaveBeenCalledWith(z)

    await click(button(root, 'Show full graph'))
    await vi.waitFor(() => expect(content(root)).toContain('Show direct steps'))
    expect(aruna.getVersionOrigin).toHaveBeenCalledWith(z)
    expect(content(root)).toContain('UpstreamHideDownload')
    expect(content(root)).toContain('z.fa')

    await click(button(root, 'Show direct steps'))
    expect(content(root)).not.toContain('z.fa')
  })

  // A chain of runs: each run has the inputs named here, each file the run that made it.
  function chainOfRuns(gate?: Promise<void>) {
    const version = (name: string) => `https://w3id.org/aruna/data/arn:aruna:r:n:s3/lab/${name}@01K8W1B3D5F7H9KMQ1S3V5X7Z1`
    const made: Record<string, string> = { x1: 'a', x2: 'b', y1: 'c', y2: 'd', z1: 'e' }
    const inputs: Record<string, string[]> = { doc1: ['x1', 'x2'], a: ['y1'], b: ['y2'], c: ['z1'], d: ['z2'], e: ['q1'] }
    const calls: string[] = []
    aruna.getRun.mockImplementation(async (runId: string) => {
      calls.push(`run ${runId}`)
      return { run_id: runId, run_crate: runId === 'r1' ? 'doc1' : runId }
    })
    aruna.fetchRoCrateRaw.mockImplementation(async (doc: string) => ({
      '@graph': [
        { '@id': '#run', '@type': 'CreateAction', name: `Run ${doc}`, object: inputs[doc]!.map((name) => ({ '@id': name })) },
        ...inputs[doc]!.map((name) => ({ '@id': name, '@type': 'File', name: `${name}.fa`, contentUrl: [`s3://lab/${name}.fa`, version(name)] })),
      ],
    }))
    aruna.getVersionOrigin.mockImplementation(async (id: string) => {
      const name = /lab\/(\w+)@/.exec(id)![1]!
      calls.push(name)
      if (gate && name === 'z1') await gate
      return origin({ origin: made[name] ? { kind: 'job', run_id: made[name] } : { kind: 'upload', node_id: 'n' } })
    })
    return calls
  }

  it('reads the full graph level by level', async () => {
    const calls = chainOfRuns()
    const root = await render()
    await vi.waitFor(() => expect(content(root)).not.toContain('Reading'))
    expect(calls).toContain('run d')
    expect(calls).not.toContain('z1')

    await click(button(root, 'Show full graph'))
    await vi.waitFor(() => expect(content(root)).toContain('Show direct steps'))
    // Both files of one level are read before the run that made one of them.
    expect(calls.indexOf('z2')).toBeLessThan(calls.indexOf('run e'))
    expect(content(root)).toContain('Upstreamq1')
    expect(content(root)).toContain('Uploaded byAda Lovelace')
  })

  it('shows the level and the links still waiting, and stops on request', async () => {
    let release = () => {}
    const calls = chainOfRuns(new Promise<void>((resolve) => (release = resolve)))
    const root = await render()
    await vi.waitFor(() => expect(content(root)).not.toContain('Reading'))
    expect(calls).toContain('run d')

    await click(button(root, 'Show full graph'))
    await vi.waitFor(() => expect(content(root)).toMatch(/Reading the full graph, level 6: \d+ steps read, 1 waiting/))
    await click(button(root, 'Stop'))
    release()
    await vi.waitFor(() => expect(content(root)).toContain('Read the rest'))
    expect(calls).not.toContain('z2')
    expect(calls).not.toContain('run e')
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
        bucket_metadata: { database: true, dataset: 'd1' },
        description: { title: 'Bakta database (light)', identifiers: [] },
        releases: [{ crate_version: 'cv-6', label: '6.0 light', upstream: [{ name: 'DOI', value: '10.5281/zenodo.14916843', url: 'https://doi.org/10.5281/zenodo.14916843' }] }] as never,
      })
    })
    const root = await render()
    // Directly, the database files sit in their release's frame, made by a run marked upstream.
    await vi.waitFor(() => expect(content(root)).toContain('Prepare Bakta DB 6.0 light'))
    expect(content(root)).toContain('66 filesShow the files')
    expect(content(root)).not.toContain('Release 6.0 light')
    expect(content(root)).toContain('UpstreamHidePrepare Bakta DB 6.0 light')
    // The archive the run unpacked is closed but shows the source it was downloaded from.
    await vi.waitFor(() => expect(content(root)).toContain('External sourcezenodo.org'))
    expect(content(root)).not.toContain('System job')
    await openAll(root)
    await vi.waitFor(() => expect(content(root)).toContain('zenodo.org'))
    const text = content(root)

    expect(text).toContain('66 filesShow the files')
    expect(text).toContain('Downloaded')
    expect(text).toContain('genome.fasta')
    expect(text).not.toContain('work/in/genome.fasta')
    expect(nodes(root).some((node) => node.props.title === 'work/in/genome.fasta')).toBe(true)
    expect(text.split('DatasetBakta database (light) 6.0 light')).toHaveLength(2)
    expect(text.split('Prepare Bakta DB 6.0 light')).toHaveLength(2)
    expect(text).toContain('zenodo.org')
    expect(text).not.toContain('/work/in/db/f3')
    // Sources at the left, the file in the last of six columns.
    const column = (label: string) => nodes(root).find((node) => node.props['data-box'] && content(node).includes(label))?.props.style
    expect(column('zenodo.org')).toMatchObject({ gridColumn: 1 })
    expect(column('This file')).toMatchObject({ gridColumn: 11 })
    // The release frame opens the dataset, not its DOI.
    const release = nodes(root).find((node) => node.tag === 'a' && content(node) === 'DatasetBakta database (light) 6.0 light')
    expect(release?.props.to).toEqual({ name: 'dataset', params: { id: 'd1' } })
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
      ...(id.includes('/out@') ? {} : { bucket_metadata: { database: true, dataset: 'd1' }, description: { title: 'Bakta database (light)', identifiers: [] }, releases: [{ crate_version: 'cv', label: '6.0 light', upstream: [] }] as never }),
    }))
    const start = { kind: 'dataset', documentId: '01M63099Q2000108CB51QQDB2P', title: 'Bakta run', crate: { '@graph': [...dbFiles, result] } }
    const { root } = await mountApp(component, { props: { start } })
    await openAll(root)
    await vi.waitFor(() => expect(content(root)).toContain('Their provenance is shown elsewhere.'))
    const text = content(root)

    // Both drawings of the files keep their frame.
    expect(text.split('DatasetBakta database (light) 6.0 light')).toHaveLength(3)
  })

  it('shows a run record\'s results as the record\'s own card, linked to their folder', async () => {
    const record = {
      '@graph': [
        { '@id': '#run-r1', '@type': 'CreateAction', name: 'Annotate', object: [{ '@id': 's3://lab/in.faa' }], result: [{ '@id': 's3://lab/out/a' }, { '@id': 's3://lab/out/b' }] },
        { '@id': 's3://lab/in.faa', '@type': 'File', name: 'in.faa', contentUrl: ['s3://lab/in.faa', INPUT] },
        { '@id': 's3://lab/out/a', '@type': 'File', name: 'a' },
        { '@id': 's3://lab/out/b', '@type': 'File', name: 'b' },
      ],
    }
    const to = { name: 'bucket', params: { bucketId: 'lab' }, query: { prefix: 'out', run: 'r1' } }
    const props = { start: { kind: 'dataset', documentId: 'd1', title: 'Annotate', crate: record }, record: { files: 2, path: 'lab/out/', to, runId: 'r1', where: 'Giessen storage 1' } }
    const { root } = await mountApp(component, { props })
    await vi.waitFor(() => expect(content(root)).toContain('Not visible to you'))
    const text = content(root)

    expect(text).toContain('2 result files')
    expect(text).toContain('This record')
    expect(text).toContain('Giessen storage 1')
    expect(text.split('No exact version recorded')).toHaveLength(1)
    expect(nodes(root).find((node) => node.tag === 'a' && content(node).includes('2 result files'))?.props.to).toEqual(to)
    expect(nodes(root).find((node) => node.tag === 'a' && content(node).includes('Annotate'))?.props.to).toEqual({ name: 'task', params: { taskId: 'r1' } })
    expect(aruna.getVersionOrigin).toHaveBeenCalledTimes(1)
  })
})
