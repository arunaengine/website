import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { compileClientComponent, content, mountApp, moduleDefault, nodes } from '@/test/clientRender'
import * as DataIdentity from '@/lib/crate/dataIdentity'
import * as FileGroups from '@/lib/fileGroups'
import * as Identifiers from '@/lib/identifiers'
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
  '@/composables/usePortalFeatures': { usePortalFeatures: () => ({ shown: () => true }) },
  '@/composables/useAruna': { useAruna: () => ({ apiBaseUrl: ref('https://api.test') }) },
  '@/composables/useUserDirectory': {
    useUserDirectory: () => ({ resolveUsers: vi.fn(), cachedUser: () => null }),
  },
  '@/composables/useS3': { useS3: () => ({ endpoint: ref('https://s3.test') }) },
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ displayName: (id: string) => (id === 'node-2' ? 'Giessen' : id) }) },
  '@/lib/config': { featureEnabled: () => false },
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
      cpuCores: '4',
      ramBytes: String(8 * 1024 ** 3),
    }
    const mounted = await mountApp(RunProvenancePanel, { props: { run } })
    const text = content(mounted.root)

    expect(text).toContain('bakta-dbrelease 6.0 light, DOI 10.5281/zenodo.149168431 KB')
    expect(text).toContain('Saved to results/bakta/')
    expect(text).toContain('Command/bakta --db /work/in/db genome.fasta')
    expect(text).toContain('WhereGiessen, kubernetes')
    expect(text).toContain('Resources4 CPU, 8 GB memory')
    expect(text).not.toContain('Started by')
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
  it('collapses a database and a crowded results folder into one row each', async () => {
    const inputs = [
      stored('laptop', 'genomes/genome.fasta', '4900000', { device: 'device-1', name: '/work/in/genome.fasta' }),
      ...Array.from({ length: 66 }, (_, index) => stored('bakta-db', `db/part-${index}.dmnd`, '1000', { partOf: [DATABASE, RELEASE] })),
    ]
    const outputs = Array.from({ length: 13 }, (_, index) => stored('laptop', `results/bakta/genome-${index}.tsv`, '100'))
    const mounted = await mountApp(RunProvenancePanel, { props: { run: { inputs, outputs } } })
    const text = content(mounted.root)

    expect(text).toContain('genome.fasta')
    expect(text).not.toContain('/work/in/')
    expect(text).toContain('from device-1')
    expect(text).toContain('Bakta database (light)')
    expect(text).toContain('release 6.0 light, 66 files')
    expect(text).toContain('DOI 10.5281/zenodo.14916843')
    expect(text).toContain('64.5 KB')
    expect(text).toContain('13 files in laptop/results/bakta/')
    expect(text).not.toContain('part-3.dmnd')

    const toggle = nodes(mounted.root).find((node) => node.tag === 'button' && content(node).includes('Bakta database'))!
    ;(toggle.props.onClick as () => void)()
    await VueRuntime.nextTick()
    expect(content(mounted.root)).toContain('part-3.dmnd1000 B')
    mounted.app.unmount()
  })
})

