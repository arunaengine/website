import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, element, mountApp, moduleDefault, nodes } from '@/test/clientRender'
import * as DataIdentity from '@/lib/crate/dataIdentity'
import * as DataEntities from '@/lib/dataEntities'
import * as LinkedPart from '@/lib/linkedPart'
import * as Uri from '@/lib/profiles/uri'
import * as Utils from '@/lib/utils'
import * as FormatCount from '@/lib/formatCount'
import * as PagedList from '@/composables/usePagedList'
import * as BucketLayout from '@/lib/bucketLayout'

const load = vi.fn()
// What the realm answered for the linked parts, and the part ids the files section asked about.
const partFacts = ref(new Map<string, unknown>())
let askedParts: { value: string[] } = { value: [] }
const user = ref<{ id: string } | null>({ id: 'u1' })
// The folders a visitor opened in place, keyed by part and prefix, and the folders asked to open.
const openedFolders = ref(new Map<string, unknown>())
const toggledFolders: string[] = []
const Slot = defineComponent((_, { slots }) => () => h('span', slots.default?.()))
const LinkStub = defineComponent({
  props: { to: { type: Object, required: true } },
  setup: (props, { slots }) => () => h('a', { to: props.to }, slots.default?.()),
})

const DatasetFiles = compileClientComponent(new URL('./DatasetFiles.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: LinkStub },
  '@/components/data/ReferencedBy.vue': moduleDefault(Slot),
  '@/components/metadata/view/VersionActions.vue': moduleDefault(defineComponent({ props: { realmId: String, versionId: String }, setup: (props) => () => h('em', `version actions ${props.realmId}/${props.versionId}`) })),
  '@/lib/linkedPart': LinkedPart,
  '@/components/nodes/NodeChips.vue': moduleDefault(defineComponent({ props: { nodes: Array }, setup: (props) => () => h('em', `nodes ${(props.nodes as string[]).join(' ')}`) })),
  '@/components/ui/Badge.vue': moduleDefault(Slot),
  '@/components/ui/Button.vue': moduleDefault(Slot),
  '@/components/ui/IconButton.vue': moduleDefault(Slot),
  '@/components/ui/EmptyState.vue': moduleDefault(Slot),
  '@/components/ui/Skeleton.vue': moduleDefault(Slot),
  '@/components/ui/DropdownMenu.vue': moduleDefault(Slot),
  '@/components/ui/DropdownMenuTrigger.vue': moduleDefault(Slot),
  '@/components/ui/DropdownMenuContent.vue': moduleDefault(Slot),
  '@/components/ui/DropdownMenuItem.vue': moduleDefault(Slot),
  '@/components/ui/ListPager.vue': moduleDefault(Slot),
  '@/components/ui/SectionHeading.vue': moduleDefault(Slot),
  '@/composables/usePagedList': PagedList,
  '@/lib/bucketLayout': BucketLayout,
  '@/lib/formatCount': FormatCount,
  '@/composables/useAruna': {
    useAruna: () => ({ currentUser: user, apiBaseUrl: ref('https://api.test') }),
  },
  '@/composables/useBacklinks': {
    useBacklinks: () => ({ result: ref(null), error: ref(null), busy: ref(false), load, reset: vi.fn() }),
  },
  '@/composables/useLinkedParts': {
    useLinkedParts: (ids: { value: string[] }) => {
      askedParts = ids
      return partFacts
    },
    usePartFolders: () => ({
      folders: openedFolders,
      keyOf: (part: { target: { id: string } }, prefix: string) => `${part.target.id}\n${prefix}`,
      toggle: (_part: unknown, prefix: string) => toggledFolders.push(prefix),
      more: vi.fn(),
    }),
  },
  '@/composables/useCrateReferences': { useCrateReferences: () => ({ referencesFor: () => [] }) },
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ localNodeId: ref('n1'), displayName: () => 'Node one' }) },
  '@/composables/useS3': {
    useS3: () => ({ hasActiveKey: ref(true), endpoint: ref('https://s3.test') }),
  },
  '@/lib/crate/dataIdentity': DataIdentity,
  '@/lib/dataEntities': DataEntities,
  '@/lib/profiles/uri': Uri,
  '@/lib/utils': Utils,
  '@lucide/vue': new Proxy({}, { get: () => Slot }),
})

const BLAKE3 = 'c'.repeat(64)
const CONTENT = `https://w3id.org/aruna/data/${BLAKE3}`

function crateWith(file: Record<string, unknown>) {
  return {
    '@graph': [
      { '@id': 'ro-crate-metadata.json', about: { '@id': './' } },
      { '@id': './', '@type': 'Dataset', hasPart: [{ '@id': file['@id'] }] },
      { '@type': 'File', name: 'one.csv', ...file },
    ],
  }
}

async function render(file: Record<string, unknown>) {
  const state = {
    detailId: ref('d1'),
    currentCrate: ref(crateWith(file)),
    subcrateIris: ref(new Set<string>()),
    loadingCrate: ref(false),
    crateNotReady: ref(false),
    fetchCrate: vi.fn(),
  }
  return mountApp(DatasetFiles, { props: { state } })
}

function browserLink(root: Parameters<typeof content>[0]) {
  return element(root, (node) => node.tag === 'a' && Boolean(node.props.to)).props.to
}

const OBJECT_ROUTE = {
  name: 'bucket',
  params: { bucketId: 'reads' },
  query: { prefix: 'raw', object: 'raw/one.csv' },
}

describe('DatasetFiles', () => {
  it('links a file in the current form to its object and offers who references it', async () => {
    const mounted = await render({ '@id': CONTENT, contentUrl: 's3://reads/raw/one.csv', localPath: 'raw/one.csv' })
    const text = content(mounted.root)

    expect(text).toContain('Open in Data')
    expect(text).toContain('Referenced by')
    expect(browserLink(mounted.root)).toEqual(OBJECT_ROUTE)
    mounted.app.unmount()
  })

  it('reads an older versioned ARN id without taking it for the content address', async () => {
    const id = 'https://w3id.org/aruna/data/arn:aruna:r1:n1:s3/reads/raw/one.csv@01JABCDEF0123456789ABCDEFG'
    const mounted = await render({ '@id': id, contentUrl: CONTENT })

    expect(content(mounted.root)).toContain('Referenced by')
    expect(browserLink(mounted.root)).toEqual(OBJECT_ROUTE)
    mounted.app.unmount()
  })

  it('links an s3 id', async () => {
    const mounted = await render({ '@id': 's3://reads/raw/one.csv' })

    expect(content(mounted.root)).not.toContain('Referenced by')
    expect(browserLink(mounted.root)).toEqual(OBJECT_ROUTE)
    mounted.app.unmount()
  })

  it('keeps an external link external', async () => {
    const mounted = await render({ '@id': '#one', contentUrl: 'https://example.org/one.csv' })
    const anchors = nodes(mounted.root).filter((node) => node.tag === 'a')

    expect(anchors.some((node) => node.props.to)).toBe(false)
    expect(anchors.some((node) => node.props.href === 'https://example.org/one.csv')).toBe(true)
    mounted.app.unmount()
  })

  it('shows the global id of a version as a version, not as an external link', async () => {
    const id = 'https://w3id.org/aruna/data/k3V9xQ2m/01K8Y2B6D8F0H2K4M6P8R0T2V4'
    const mounted = await render({ '@id': id, contentUrl: id })
    const text = content(mounted.root)

    expect(text).not.toContain('External')
    expect(text).not.toContain('Open the location')
    expect(nodes(mounted.root).some((node) => node.tag === 'a' && node.props.href)).toBe(false)
    mounted.app.unmount()
  })

  it('offers download and preview for a file named only by its global version id', async () => {
    const id = 'https://w3id.org/aruna/data/k3V9xQ2m/01K8Y2B6D8F0H2K4M6P8R0T2V4'
    const global = await render({ '@id': id, contentUrl: id })
    expect(content(global.root)).toContain('version actions k3V9xQ2m/01K8Y2B6D8F0H2K4M6P8R0T2V4')
    global.app.unmount()
    const local = await render({ '@id': 's3://reads/raw/one.csv' })
    expect(content(local.root)).not.toContain('version actions')
    local.app.unmount()
  })

  it('marks a file kept at another realm as external', async () => {
    const mounted = await render({ '@id': 'https://data.giessen.example/api/v1/objects/one.csv' })
    expect(content(mounted.root)).toContain('External')
    mounted.app.unmount()
    const local = await render({ '@id': 's3://reads/raw/one.csv' })
    expect(content(local.root)).not.toContain('External')
    local.app.unmount()
  })

  it('shows no location for a relative id', async () => {
    const mounted = await render({ '@id': 'raw/one.csv' })

    expect(content(mounted.root)).not.toContain('Open the location')
    expect(content(mounted.root)).not.toContain('Open in Data')
    mounted.app.unmount()
  })

  it('shows a linked bucket as a row with its node, links its name to Data and names the other datasets', async () => {
    const part = 'https://w3id.org/aruna/data/k3V9xQ2m/01K8Y2B6D8/cmF3LzIwMjYv'
    const route = { name: 'bucket', params: { bucketId: 'raw' }, query: { node: 'n2' } }
    partFacts.value = new Map([[part, {
      target: { id: part, bucket: 'raw', prefix: '', node_id: 'n2', held_here: false },
      problem: null,
      route,
      nodes: ['n2', 'n3'],
      usage: { bucket: 'raw', objects: 68231, versions: 0, delete_markers: 0, open_multipart_uploads: 0, logical_bytes: 5 * 1024 ** 3, current_bytes: 2 * 1024 ** 3, complete: true },
      entries: { list: [{ name: 'genomes', folder: true, size: null, route: { name: 'bucket', params: { bucketId: 'raw' }, query: { prefix: 'genomes' } } }], more: true },
      others: [{ document_id: 'd2', group_id: 'g1', document_path: 'other', graph_iri: '', title: 'Other set', links: [] }],
    }]])
    const mounted = await render({ '@id': part, '@type': 'Dataset', name: 'Raw 2026' })
    const text = content(mounted.root)
    partFacts.value = new Map()

    expect(askedParts.value).toEqual([part])
    expect(element(mounted.root, (node) => node.tag === 'a' && content(node) === 'Raw 2026').props.to).toEqual(route)
    expect(text).toContain('68,231')
    expect(text).toContain('2.0\u00a0GiB')
    expect(text).toContain('nodes n2 n3')
    expect(text).toContain('genomes')
    expect(text).toContain('More in Data')
    expect(text).toContain('Also linked by')
    expect(text).toContain('Other set')
    expect(text).not.toContain('Browse the files')
    mounted.app.unmount()
  })

  it('downloads a listed file of a linked bucket when the entry names a download', async () => {
    const part = 'arn:aruna:r:n2:s3/raw/'
    const download = 'https://n2.test/api/v1/ga4gh/drs/v1/download?object_id=x'
    const folderRoute = { name: 'bucket', params: { bucketId: 'raw' }, query: { prefix: 'genomes', node: 'n2' } }
    partFacts.value = new Map([[part, {
      target: { id: part, bucket: 'raw', prefix: '', node_id: 'n2', held_here: false },
      problem: null,
      route: { name: 'bucket', params: { bucketId: 'raw' }, query: { node: 'n2' } },
      nodes: ['n2'],
      usage: null,
      entries: {
        list: [
          { name: 'genomes', folder: true, size: null, route: folderRoute },
          { name: 'README.md', folder: false, size: 12, route: OBJECT_ROUTE, download },
        ],
        more: false,
      },
      others: [],
    }]])
    const mounted = await render({ '@id': part, '@type': 'Dataset', name: 'raw' })
    partFacts.value = new Map()

    const file = element(mounted.root, (node) => node.tag === 'a' && content(node) === 'README.md')
    expect(file.props.href).toBe(download)
    expect(file.props.to).toBeUndefined()
    expect(element(mounted.root, (node) => node.tag === 'a' && content(node) === 'genomes').props.to).toEqual(folderRoute)
    mounted.app.unmount()
  })

  it('shows why the files of a linked bucket or an opened folder could not be listed', async () => {
    const part = 'arn:aruna:r:n2:s3/raw/'
    const genomes = { name: 'genomes', folder: true, size: null, route: { name: 'bucket' }, prefix: 'genomes/' }
    partFacts.value = new Map([[part, {
      target: { id: part, bucket: 'raw', prefix: '', node_id: 'n2', held_here: false },
      problem: null,
      route: null,
      nodes: ['n2'],
      usage: null,
      entries: { list: [genomes], more: false },
      listError: 'Not authorized',
      others: [],
    }]])
    openedFolders.value = new Map([[`${part}\ngenomes/`, { list: [], more: false, loading: false, error: 'Node did not answer' }]])
    user.value = null
    const mounted = await render({ '@id': part, '@type': 'Dataset', name: 'raw' })
    const text = content(mounted.root)
    partFacts.value = new Map()
    openedFolders.value = new Map()
    user.value = { id: 'u1' }

    expect(text).toContain('The files could not be listed: Not authorized')
    expect(text).toContain('The files could not be listed: Node did not answer')
    mounted.app.unmount()
  })

  it('opens a folder of a linked bucket in place for a visitor and downloads its files', async () => {
    const part = 'arn:aruna:r:n2:s3/raw/'
    const download = 'https://n2.test/api/v1/ga4gh/drs/v1/download?object_id=y'
    const genomes = { name: 'genomes', folder: true, size: null, route: { name: 'bucket' }, prefix: 'genomes/' }
    partFacts.value = new Map([[part, {
      target: { id: part, bucket: 'raw', prefix: '', node_id: 'n2', held_here: false },
      problem: null,
      route: { name: 'bucket', params: { bucketId: 'raw' }, query: { node: 'n2' } },
      nodes: ['n2'],
      usage: null,
      entries: { list: [genomes], more: true },
      others: [],
    }]])
    openedFolders.value = new Map([[`${part}\ngenomes/`, { list: [{ name: 'a.fna', folder: false, size: 3, route: OBJECT_ROUTE, download }], more: false, loading: false }]])
    user.value = null
    const mounted = await render({ '@id': part, '@type': 'Dataset', name: 'raw' })
    partFacts.value = new Map()
    openedFolders.value = new Map()
    user.value = { id: 'u1' }

    const text = content(mounted.root)
    expect(element(mounted.root, (node) => node.tag === 'a' && content(node) === 'a.fna').props.href).toBe(download)
    expect(nodes(mounted.root).some((node) => node.tag === 'a' && content(node) === 'raw')).toBe(false)
    expect(text).toContain('Show more')
    expect(text).not.toContain('More in Data')
    await click(button(mounted.root, 'genomes'))
    expect(toggledFolders).toEqual(['genomes/'])
    mounted.app.unmount()
  })

  it('asks the realm about nothing for a file, or a Dataset that is not a bucket', async () => {
    const file = await render({ '@id': 's3://reads/raw/one.csv' })
    expect(askedParts.value).toEqual([])
    expect(content(file.root)).not.toContain('Also linked by')
    file.app.unmount()
    const dataset = await render({ '@id': '#sub', '@type': 'Dataset', name: 'Sub' })
    expect(askedParts.value).toEqual([])
    dataset.app.unmount()
  })

  it('opens top folders, keeps deeper ones closed and counts the files below', async () => {
    const state = {
      detailId: ref('d1'),
      currentCrate: ref({
        '@graph': [
          { '@id': 'ro-crate-metadata.json', about: { '@id': './' } },
          { '@id': './', '@type': 'Dataset', hasPart: [{ '@id': 'db/' }] },
          { '@id': 'db/', '@type': 'Dataset', name: 'db', hasPart: [{ '@id': 'db/a.txt' }, { '@id': 'db/sub/' }] },
          { '@id': 'db/a.txt', '@type': 'File', name: 'a.txt', contentSize: '1024' },
          { '@id': 'db/sub/', '@type': 'Dataset', name: 'sub', hasPart: [{ '@id': 'db/sub/b.txt' }] },
          { '@id': 'db/sub/b.txt', '@type': 'File', name: 'b.txt', contentSize: '1024' },
        ],
      }),
      subcrateIris: ref(new Set<string>()),
      loadingCrate: ref(false),
      crateNotReady: ref(false),
      fetchCrate: vi.fn(),
    }
    const mounted = await mountApp(DatasetFiles, { props: { state } })
    const text = content(mounted.root)

    expect(text).toContain('db')
    expect(nodes(mounted.root).some((node) => node.tag === 'td' && content(node).trim() === '2')).toBe(true)
    expect(text).toContain('2.0\u00a0KiB')
    expect(text).toContain('a.txt')
    expect(text).toContain('sub')
    expect(text).not.toContain('b.txt')
    mounted.app.unmount()
  })

  it('shows a whole bucket as one row with its unlisted files and its layout', async () => {
    const T = 'https://w3id.org/aruna/terms/'
    const state = {
      detailId: ref('d1'),
      currentCrate: ref({
        '@graph': [
          { '@id': 'ro-crate-metadata.json', about: { '@id': './' } },
          { '@id': './', '@type': 'Dataset', hasPart: [{ '@id': 's3://bakrep/' }] },
          { '@id': 's3://bakrep/', '@type': 'Dataset', name: 'bakrep/', [`${T}fileCount`]: '43882006', [`${T}layout`]: { '@id': '#l1' } },
          { '@id': '#l1', additionalType: { '@id': `${T}FilePattern` }, urlTemplate: '{sample}/{sample}.fna.gz', encodingFormat: 'text/x-fasta', [`${T}fileCount`]: '2925467' },
        ],
      }),
      subcrateIris: ref(new Set<string>()),
      loadingCrate: ref(false),
      crateNotReady: ref(false),
      fetchCrate: vi.fn(),
    }
    const mounted = await mountApp(DatasetFiles, { props: { state } })
    const text = content(mounted.root)

    expect(text).toContain('43,882,006 files not listed in this dataset')
    expect(text).toContain('Open in Data')
    expect(text).toContain('{sample}/{sample}.fna.gz')
    expect(text).toContain('2,925,467 files')
    mounted.app.unmount()
  })
})
