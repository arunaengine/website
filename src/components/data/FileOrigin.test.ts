import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { OriginResponse } from '@/lib/api'
import * as ContentIdentity from '@/lib/contentIdentity'
import * as FileOriginLib from '@/lib/fileOrigin'
import * as Utils from '@/lib/utils'
import { button, click, compileClientComponent, content, mountApp, moduleDefault } from '@/test/clientRender'

const origin = ref<OriginResponse | null>(null)
const state = ref('ready')
const downloadUrl = vi.fn(async () => 'https://s3.test/signed')

const Marker = (text: string) => defineComponent({ props: { globalUrl: String }, setup: (props) => () => h('section', `${text} ${props.globalUrl ?? ''}`) })

const component = compileClientComponent(new URL('./FileOrigin.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: defineComponent((_, { slots }) => () => h('a', slots.default?.())) },
  '@/components/data/OriginLine.vue': moduleDefault(Marker('origin line')),
  '@/components/distributed/GlobalId.vue': moduleDefault(Marker('global id')),
  '@/components/data/ProvenanceView.vue': moduleDefault(
    defineComponent({ props: { start: Object }, setup: (props) => () => h('section', `provenance ${(props.start as { id: string }).id}`) }),
  ),
  '@/components/ui/Button.vue': moduleDefault(defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()) })),
  '@/components/ui/DetailDialog.vue': moduleDefault(
    defineComponent({ props: { open: Boolean }, setup: (props, { slots }) => () => (props.open ? h('dialog', [slots.header?.(), slots.default?.()]) : null) }),
  ),
  '@/composables/useAruna': { useAruna: () => ({ realmInfo: ref({ realm_id: 'realm1' }) }) },
  '@/lib/contentIdentity': ContentIdentity,
  '@/components/ui/Spinner.vue': moduleDefault(defineComponent(() => () => h('i'))),
  '@/composables/useS3': { useS3: () => ({ downloadUrl }), s3ErrorMessage: (cause: unknown) => String(cause) },
  '@/composables/useDatabases': { useDatabases: () => ({ rows: ref([]) }) },
  '@/composables/useFileOrigin': { useFileOrigin: () => ({ origin, state, error: ref(null) }) },
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ displayName: (id: string) => id, localNodeId: ref('node1') }) },
  '@/lib/fileOrigin': FileOriginLib,
  '@/lib/utils': Utils,
})

function response(extra: Partial<OriginResponse>): OriginResponse {
  return { version_id: 'v1', created_by: 'u1', created_at: '2026-10-20T10:12:00Z', projection: [], ...extra }
}

async function render() {
  const { root } = await mountApp(component, { props: { target: { bucket: 'spire', key: 'a.tsv', versionId: null } } })
  return root
}

describe('file origin', () => {
  it('shows the id of a version of a bucket on more nodes and downloads that version through the session', async () => {
    state.value = 'ready'
    origin.value = response({ global_id: 'https://w3id.org/aruna/data/k3V9/01K8Y2', origin: { kind: 'upload', node_id: 'n1' } })
    const root = await render()

    expect(content(root)).toContain('global id https://w3id.org/aruna/data/k3V9/01K8Y2')
    expect(content(root)).not.toContain('/resolve/')
    const appended: unknown[] = []
    const body = { append: (node: unknown) => appended.push(node) }
    vi.stubGlobal('document', { body, createElement: () => ({ click: vi.fn(), remove: vi.fn() }) })
    await (button(root, 'Download this version').props.onClick as () => Promise<void>)()
    vi.unstubAllGlobals()

    expect(downloadUrl).toHaveBeenCalledWith('spire', 'a.tsv', null, 'v1', 'a.tsv')
    expect(appended).toEqual([expect.objectContaining({ href: 'https://s3.test/signed', download: 'a.tsv' })])
  })

  it('shows no id for a bucket on one node, and says when nothing was recorded', async () => {
    origin.value = response({})
    const root = await render()

    expect(content(root)).not.toContain('global id')
    expect(content(root)).toContain('Not recorded for this version.')
  })

  it('shows nothing when the node has no origin route', async () => {
    state.value = 'missing'
    origin.value = null

    expect(content(await render())).not.toContain('Origin')
  })
})

describe('file origin identifiers', () => {
  it('shows each identifier of the database as a link, and adds it to datasets', async () => {
    const url = 'https://www.ebi.ac.uk/biosamples/samples/SAMN15803895'
    state.value = 'ready'
    origin.value = response({
      origin: { kind: 'source', database_entry: 'e1' },
      identifiers: [{ name: 'BioSample', value: 'SAMN15803895', url, target: 'key' }],
      projection: [{ property: 'identifier', name: 'BioSample', value: 'SAMN15803895', url }],
    })
    const root = await render()

    expect(content(root)).toContain('Identifier: BioSample SAMN15803895 ↗')
    expect(content(root)).toContain('Found by the current rules of the database.')
    expect(content(root)).toContain('identifierBioSample SAMN15803895')
  })
})

describe('file origin provenance', () => {
  it('opens where the file came from at its exact version id', async () => {
    state.value = 'ready'
    origin.value = response({ origin: { kind: 'job', run_id: 'r1' } })
    const root = await render()
    expect(content(root)).not.toContain('provenance')

    await click(button(root, 'Where it came from'))
    expect(content(root)).toContain('provenance https://w3id.org/aruna/data/arn:aruna:realm1:node1:s3/spire/a.tsv@v1')
  })

  it('starts a distributed file at its global id', async () => {
    state.value = 'ready'
    origin.value = response({ global_id: 'https://w3id.org/aruna/data/realm1/01K8Y2' })
    const root = await render()
    await click(button(root, 'Where it came from'))

    expect(content(root)).toContain('provenance https://w3id.org/aruna/data/realm1/01K8Y2')
  })
})
