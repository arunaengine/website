import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { compileClientComponent, content, element, mountApp, moduleDefault, nodes } from '@/test/clientRender'
import * as DataIdentity from '@/lib/crate/dataIdentity'
import * as DataEntities from '@/lib/dataEntities'
import * as Uri from '@/lib/profiles/uri'

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
  '@/components/ui/Badge.vue': moduleDefault(Slot),
  '@/components/ui/Button.vue': moduleDefault(Slot),
  '@/components/ui/IconButton.vue': moduleDefault(Slot),
  '@/components/ui/EmptyState.vue': moduleDefault(Slot),
  '@/components/ui/Skeleton.vue': moduleDefault(Slot),
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
  it('links a file in the current form to its object', async () => {
    const mounted = await render({ '@id': CONTENT, contentUrl: 's3://reads/raw/one.csv', localPath: 'raw/one.csv' })
    const text = content(mounted.root)

    expect(text).toContain(`Content identity: ${CONTENT}`)
    expect(text).toContain('Location: s3://reads/raw/one.csv')
    expect(browserLink(mounted.root)).toEqual(OBJECT_ROUTE)
    mounted.app.unmount()
  })

  it('reads an older versioned ARN id without taking it for the content address', async () => {
    const id = 'https://w3id.org/aruna/data/arn:aruna:r1:n1:s3/reads/raw/one.csv@01V'
    const mounted = await render({ '@id': id, contentUrl: CONTENT })
    const text = content(mounted.root)

    expect(text).toContain(`Content identity: ${CONTENT}`)
    expect(text).toContain('Location: s3://reads/raw/one.csv')
    expect(browserLink(mounted.root)).toEqual(OBJECT_ROUTE)
    mounted.app.unmount()
  })

  it('links an s3 id', async () => {
    const mounted = await render({ '@id': 's3://reads/raw/one.csv' })

    expect(content(mounted.root)).not.toContain('Content identity')
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

  it('shows no location for a relative id', async () => {
    const mounted = await render({ '@id': 'raw/one.csv' })

    expect(content(mounted.root)).not.toContain('Location')
    mounted.app.unmount()
  })
})
