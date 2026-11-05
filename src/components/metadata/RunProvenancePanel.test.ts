import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { compileClientComponent, content, mountApp, moduleDefault, nodes } from '@/test/clientRender'
import * as DataIdentity from '@/lib/crate/dataIdentity'
import * as FileGroups from '@/lib/fileGroups'
import * as Identifiers from '@/lib/identifiers'
import * as RunCrate from '@/lib/runCrate'
import * as Tes from '@/lib/tes'
import * as Utils from '@/lib/utils'

const Slot = defineComponent((_, { slots }) => () => h('span', slots.default?.()))
const LinkStub = defineComponent({
  props: { to: { type: Object, required: true } },
  setup: (props, { slots }) => () => h('a', { to: props.to }, slots.default?.()),
})

const RunProvenancePanel = compileClientComponent(new URL('./RunProvenancePanel.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: LinkStub },
  '@/components/ui/Badge.vue': moduleDefault(Slot),
  '@/components/ui/ExternalLink.vue': moduleDefault(defineComponent({ props: { href: String, label: String }, setup: (props) => () => h('a', { href: props.href }, props.label) })),
  '@/components/ui/Notice.vue': moduleDefault(Slot),
  '@/components/ui/Button.vue': moduleDefault(defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()) })),
  '@/components/ui/CopyButton.vue': moduleDefault(defineComponent({ props: { value: String, label: String }, setup: (props) => () => h('button', { 'aria-label': props.label, 'data-copy': props.value }) })),
  '@/components/ui/DetailList.vue': moduleDefault(defineComponent({
    props: { items: { type: Array, required: true } },
    setup: (props, { slots }) => () => h('dl', (props.items as { key?: string; label: string; value: string }[]).map((item) =>
      h('div', [h('dt', item.label), h('dd', slots[item.key ?? item.label]?.({ item }) ?? item.value)]))),
  })),
  '@/components/ui/IconTile.vue': moduleDefault(defineComponent(() => () => h('i'))),
  '@/components/ui/ListPager.vue': moduleDefault(defineComponent({
    props: { page: Number, pageSize: Number, total: Number },
    emits: ['update:page'],
    setup: (props, { emit }) => () => h('nav', [h('button', { onClick: () => emit('update:page', (props.page ?? 1) + 1) }, `Next page of ${props.total}`)]),
  })),
  '@/composables/usePagedList': await import('@/composables/usePagedList'),
  '@/components/ui/SectionHeading.vue': moduleDefault(defineComponent({ props: { title: String }, setup: (props, { slots }) => () => h('div', [h('h2', props.title), slots.actions?.()]) })),
  '@/components/data/ObjectIcon.vue': moduleDefault(defineComponent(() => () => h('i'))),
  '@/composables/usePortalFeatures': { usePortalFeatures: () => ({ shown: () => true }) },
  '@/composables/useAruna': { useAruna: () => ({ apiBaseUrl: ref('https://api.test') }) },
  '@/composables/useUserDirectory': {
    useUserDirectory: () => ({ resolveUsers: vi.fn(), cachedUser: () => null }),
  },
  '@/composables/useS3': { useS3: () => ({ endpoint: ref('https://s3.test') }) },
  '@/composables/useRealmNodes': {
    useRealmNodes: () => ({
      displayName: (id: string) => (id === 'node-2' ? 'Giessen' : id),
      isLocalNode: (id: string) => id === 'n1',
      // `given` is the shared name rule's answer: the realm display name first, then the labels.
      nodes: ref([
        { nodeId: 'device-1', info: { labels: { name: 'laptop' } }, given: 'laptop' },
        { nodeId: 'device-2', info: { labels: { device: 'old-slug' } }, given: 'Microbiology laptop' },
      ]),
    }),
  },
  '@/lib/config': { featureEnabled: () => false },
  '@/lib/runCrate': RunCrate,
  '@/lib/tes': Tes,
  '@/lib/crate/dataIdentity': DataIdentity,
  '@/lib/fileGroups': FileGroups,
  '@/lib/identifiers': Identifiers,
  '@/lib/utils': Utils,
  '@lucide/vue': new Proxy({}, { get: () => Slot }),
})

const CONTENT = `https://w3id.org/aruna/data/${'d'.repeat(64)}`

async function linkOf(output: { id: string; contentUrl?: string }) {
  const run = { inputs: [], outputs: [{ name: 'out.csv', ...output }] }
  const mounted = await mountApp(RunProvenancePanel, { props: { run } })
  const anchor = nodes(mounted.root).find((node) => node.tag === 'a')
  mounted.app.unmount()
  return anchor?.props ?? null
}

describe('RunProvenancePanel', () => {
  it('opens a versioned ARN output in the bucket browser', async () => {
    const id = 'https://w3id.org/aruna/data/arn:aruna:r1:n1:s3/results/runs/out.csv@01JABCDEF0123456789ABCDEFG'
    expect((await linkOf({ id, contentUrl: CONTENT }))?.to).toEqual({
      name: 'bucket',
      params: { bucketId: 'results' },
      query: { prefix: 'runs' },
    })
  })

  it('opens an output of another node on that node', async () => {
    const id = 'https://w3id.org/aruna/data/arn:aruna:r1:node-2:s3/laptop/results/run/out/out.csv@01JABCDEF0123456789ABCDEFG'
    expect((await linkOf({ id, contentUrl: CONTENT }))?.to).toEqual({
      name: 'bucket',
      params: { bucketId: 'laptop' },
      query: { prefix: 'results/run/out', node: 'node-2' },
    })
  })

  it('opens a current form output in the bucket browser', async () => {
    expect((await linkOf({ id: CONTENT, contentUrl: 's3://results/runs/out.csv' }))?.to).toEqual({
      name: 'bucket',
      params: { bucketId: 'results' },
      query: { prefix: 'runs' },
    })
  })

  it('resolves a bare content address through DRS', async () => {
    expect((await linkOf({ id: CONTENT }))?.href).toBe(Tes.drsObjectHref('https://api.test', CONTENT))
  })

  it('shows inputs with their release, results with where they were saved, and what ran', async () => {
    const run = {
      inputs: [{ id: 'db', name: 'bakta-db', version: '6.0 light', identifier: '10.5281/zenodo.14916843', contentSize: '1024' }],
      outputs: [
        { id: 'a', name: 'genome.gff3', contentUrl: 's3://results/bakta/genome.gff3' },
        { id: 'b', name: 'genome.tsv', contentUrl: 's3://results/bakta/genome.tsv' },
      ],
      command: '/bakta --db /work/in/db genome.fasta',
      site: { nodeId: 'node-2', kind: 'kubernetes' },
      container: { name: 'bakta-rs', sha256: `2bf2${'0'.repeat(55)}f32cc` },
      cpuCores: '4',
      // TES asks for 2\u00a0GiB, which the run view shows as 2\u00a0GiB, not 1.9.
      ramBytes: '2000000000',
    }
    const mounted = await mountApp(RunProvenancePanel, { props: { run } })
    const text = content(mounted.root)

    expect(text).toContain('bakta-dbrelease 6.0 light, DOI 10.5281/zenodo.149168431\u00a0KiB')
    // The results name their count and the folder they went to, linked.
    expect(text).toContain('2 files')
    expect(text).toContain('results/bakta/')
    expect(text).toContain('Command/bakta --db /work/in/db genome.fasta')
    expect(text).toContain('WhereGiessenKubernetes')
    expect(text).toContain('bakta-rs@sha256:2bf2…f32cc')
    expect(text).not.toContain('0'.repeat(55))
    expect(text).toContain('Resources4\u00a0CPU, 2\u00a0GB memory')
    expect(text).not.toContain('Started by')
    mounted.app.unmount()
  })
})

describe('RunProvenancePanel served inputs', () => {
  it('names the source that served an input in plain words', async () => {
    const run = { inputs: [{ id: 'db', name: 'db-light.tar.xz', servedBy: 'https://mirror.example/files/db-light.tar.xz' }], outputs: [] }
    const mounted = await mountApp(RunProvenancePanel, { props: { run } })

    expect(content(mounted.root)).toContain('Read from mirror.example')
    mounted.app.unmount()
  })
})

describe('RunProvenancePanel record facts', () => {
  it('names the record id and its API address with copy buttons, without a provenance button', async () => {
    const run = { inputs: [], outputs: [], command: 'run.sh' }
    const mounted = await mountApp(RunProvenancePanel, { props: { run, documentId: 'doc-1', published: '2026-10-29T10:00:00Z' } })
    const copies = nodes(mounted.root).filter((node) => node.props['data-copy']).map((node) => node.props['data-copy'])

    expect(content(mounted.root)).toContain('Record iddoc-1')
    expect(copies).toEqual(['doc-1', 'https://api.test/metadata/doc-1', 'run.sh'])
    expect(content(mounted.root)).toContain('Published')
    expect(content(mounted.root)).not.toContain('Show provenance')
    mounted.app.unmount()
  })
})

const VERSION = '01JABCDEF0123456789ABCDEFG'
const DATABASE = { id: '#bucket-metadata-0123', kind: 'database', name: 'Bakta database (light)', version: '6.0', links: ['https://doi.org/10.5281/zenodo.14916843'] }
const RELEASE = { id: 'https://w3id.org/aruna/release-6', kind: 'release', name: 'Release 6.0 light', version: '6.0 light', links: [] }
const stored = (bucket: string, key: string, size: string, extra: Record<string, unknown> = {}) => ({
  id: `${bucket}/${key}`,
  name: key.split('/').pop(),
  contentSize: size,
  contentUrls: [`s3://${bucket}/${key}`, `https://w3id.org/aruna/data/arn:aruna:r1:node-2:s3/${bucket}/${key}@${VERSION}`],
  contentUrl: `s3://${bucket}/${key}`,
  ...extra,
})

describe('RunProvenancePanel grouped files', () => {
  it('opens groups at first, pages each card and toggles one card without moving the other', async () => {
    const inputs = [
      stored('laptop', 'my-genome/genome.fasta', '4900000', { device: 'device-1', name: 'work/in/genome.fasta' }),
      ...Array.from({ length: 66 }, (_, index) => stored('bakta-db', `db/part-${index}.dmnd`, '1000', { partOf: [DATABASE, RELEASE] })),
    ]
    const outputs = Array.from({ length: 13 }, (_, index) => stored('laptop', `results/bakta/genome-${index}.tsv`, '100'))
    const mounted = await mountApp(RunProvenancePanel, { props: { run: { inputs, outputs } } })
    const text = content(mounted.root)

    expect(text).toContain('genome.fasta')
    expect(text).not.toContain('work/in/')
    expect(text).toContain('from laptop')
    expect(text).toContain('Bakta database (light)')
    expect(text).toContain('release 6.0 light, 66 files')
    expect(text).toContain('DOI 10.5281/zenodo.14916843')
    expect(text).toContain('64.5\u00a0KiB')
    // A database counts as one input; results in one folder name it in their summary row.
    expect(text).toContain('2 inputs')
    expect(text).toContain('67 files')
    expect(text).toContain('13 files')
    expect(text).toContain('laptop/results/bakta/')
    expect(text).toContain('part-3.dmnd1000\u00a0B')
    expect(text).not.toContain('part-9.dmnd')
    expect(text).toContain('genome-0.tsv')
    expect(text).not.toContain('genome-10.tsv')
    expect(text).toContain('Next page of 68')
    expect(text).toContain('Next page of 13')

    const toggle = nodes(mounted.root).find((node) => node.tag === 'button' && content(node).includes('Bakta database'))!
    ;(toggle.props.onClick as () => void)()
    await VueRuntime.nextTick()
    expect(content(mounted.root)).not.toContain('part-3.dmnd')
    expect(content(mounted.root)).toContain('genome-0.tsv')
    mounted.app.unmount()
  })

  it('pages the files of one folder, the same in both cards', async () => {
    const files = (folder: string) => Array.from({ length: 12 }, (_, index) => stored('laptop', `${folder}/part-${index % 2}/file-${index}.tsv`, '100'))
    const mounted = await mountApp(RunProvenancePanel, { props: { run: { inputs: files('in'), outputs: files('out') } } })
    expect(content(mounted.root)).toContain('part-0/file-0.tsv')
    expect(content(mounted.root)).not.toContain('file-11.tsv')
    expect(content(mounted.root)).not.toContain('Show all')

    const next = nodes(mounted.root).filter((node) => node.tag === 'button' && content(node).startsWith('Next page'))
    expect(next).toHaveLength(2)
    ;(next[1]!.props.onClick as () => void)()
    await VueRuntime.nextTick()
    expect(content(mounted.root).split('file-11.tsv')).toHaveLength(2)
    mounted.app.unmount()
  })

  it('shows no size for inputs without known sizes', async () => {
    const inputs = Array.from({ length: 9 }, (_, index) => stored('drought-study-2026', `plots/file-${index}.csv`, ''))
    const mounted = await mountApp(RunProvenancePanel, { props: { run: { inputs, outputs: [] } } })
    const text = content(mounted.root)

    expect(text).toContain('9 files')
    expect(text).not.toContain('at least')
    expect(text).not.toContain('0\u00a0B')
    mounted.app.unmount()
  })

  it('sums the input sizes when every file names one', async () => {
    const inputs = Array.from({ length: 9 }, (_, index) => stored('drought-study-2026', `plots/file-${index}.csv`, '1024'))
    const mounted = await mountApp(RunProvenancePanel, { props: { run: { inputs, outputs: [] } } })

    expect(content(mounted.root)).toContain('9 files 9\u00a0KiB')
    mounted.app.unmount()
  })

  it('names a device without a name of its own in plain words', async () => {
    const inputs = [stored('laptop', 'my-genome/genome.fasta', '4900000', { device: 'device-9', name: 'work/in/genome.fasta' })]
    const mounted = await mountApp(RunProvenancePanel, { props: { run: { inputs, outputs: [] } } })

    expect(content(mounted.root)).toContain('from a device')
    mounted.app.unmount()
  })

  it('names the device by its realm display name and the input by its stored file name, still linked', async () => {
    const inputs = [stored('laptop', 'inputs/genome.fasta', '5400000', { device: 'device-2', name: 'genome' })]
    const mounted = await mountApp(RunProvenancePanel, { props: { run: { inputs, outputs: [] } } })
    const text = content(mounted.root)

    expect(text).toContain('from Microbiology laptop')
    expect(text).not.toContain('old-slug')
    expect(text).not.toContain('from a device')
    // The whole row opens the input's folder.
    const row = nodes(mounted.root).find((node) => node.tag === 'a' && content(node).includes('genome.fasta'))
    expect(row?.props.to).toEqual({ name: 'bucket', params: { bucketId: 'laptop' }, query: { prefix: 'inputs', node: 'node-2' } })
    mounted.app.unmount()
  })
})
