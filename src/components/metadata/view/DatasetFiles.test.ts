import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { compileClientComponent, content, element, mountApp, moduleDefault, nodes } from '@/test/clientRender'
import * as DataIdentity from '@/lib/crate/dataIdentity'
import * as DataEntities from '@/lib/dataEntities'
import * as LinkedPart from '@/lib/linkedPart'
import * as Uri from '@/lib/profiles/uri'
import * as Utils from '@/lib/utils'
import * as FormatCount from '@/lib/formatCount'
import * as PagedList from '@/composables/usePagedList'

const load = vi.fn()
const Slot = defineComponent((_, { slots }) => () => h('span', slots.default?.()))
const LinkStub = defineComponent({
  props: { to: { type: Object, required: true } },
  setup: (props, { slots }) => () => h('a', { to: props.to }, slots.default?.()),
})

const DatasetFiles = compileClientComponent(new URL('./DatasetFiles.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: LinkStub },
  '@/components/data/ReferencedBy.vue': moduleDefault(Slot),
  '@/components/metadata/view/LinkedPartActions.vue': moduleDefault(defineComponent({ props: { id: String }, setup: (props) => () => h('em', `linked part ${props.id}`) })),
  '@/components/metadata/view/VersionActions.vue': moduleDefault(defineComponent({ props: { realmId: String, versionId: String }, setup: (props) => () => h('em', `version actions ${props.realmId}/${props.versionId}`) })),
  '@/lib/linkedPart': LinkedPart,
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
  '@/lib/formatCount': FormatCount,
  '@/composables/useAruna': {
    useAruna: () => ({ currentUser: ref({ id: 'u1' }), apiBaseUrl: ref('https://api.test') }),
  },
  '@/composables/useBacklinks': {
    useBacklinks: () => ({ result: ref(null), error: ref(null), busy: ref(false), load, reset: vi.fn() }),
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

  it('offers the live files and the other datasets for a Dataset-typed part that names a bucket', async () => {
    const part = 'https://w3id.org/aruna/data/k3V9xQ2m/01K8Y2B6D8/cmF3LzIwMjYv'
    const mounted = await render({ '@id': part, '@type': 'Dataset', name: 'Raw 2026' })

    expect(content(mounted.root)).toContain(`linked part ${part}`)
    mounted.app.unmount()
  })

  it('offers nothing of the kind for a file, or a Dataset that is not a bucket', async () => {
    const file = await render({ '@id': 's3://reads/raw/one.csv' })
    expect(content(file.root)).not.toContain('linked part')
    file.app.unmount()
    const dataset = await render({ '@id': '#sub', '@type': 'Dataset', name: 'Sub' })
    expect(content(dataset.root)).not.toContain('linked part')
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
    expect(text).toContain('2 files')
    expect(text).toContain('2.0\u00a0KiB')
    expect(text).toContain('a.txt')
    expect(text).toContain('sub')
    expect(text).not.toContain('b.txt')
    mounted.app.unmount()
  })
})
