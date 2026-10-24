import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it } from 'vitest'
import type { OriginResponse } from '@/lib/api'
import * as FileOriginLib from '@/lib/fileOrigin'
import * as Utils from '@/lib/utils'
import { compileClientComponent, content, element, mountApp, moduleDefault } from '@/test/clientRender'

const origin = ref<OriginResponse | null>(null)
const state = ref('ready')

const Marker = (text: string) => defineComponent({ props: { globalUrl: String }, setup: (props) => () => h('section', `${text} ${props.globalUrl ?? ''}`) })

const component = compileClientComponent(new URL('./FileOrigin.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: defineComponent((_, { slots }) => () => h('a', slots.default?.())) },
  '@/components/data/OriginLine.vue': moduleDefault(Marker('origin line')),
  '@/components/distributed/GlobalId.vue': moduleDefault(Marker('global id')),
  '@/components/ui/Spinner.vue': moduleDefault(defineComponent(() => () => h('i'))),
  '@/composables/useAruna': { useAruna: () => ({ apiBaseUrl: ref('https://node.test/api/v1') }) },
  '@/composables/useDatabases': { useDatabases: () => ({ rows: ref([]) }) },
  '@/composables/useFileOrigin': { useFileOrigin: () => ({ origin, state, error: ref(null) }) },
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ displayName: (id: string) => id }) },
  '@/lib/api': { apiUrl: (path: string, _query: unknown, client: { baseUrl: string }) => new URL(`${client.baseUrl}${path}`) },
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
  it('shows the id of a version of a bucket on more nodes and the download link on this node', async () => {
    state.value = 'ready'
    origin.value = response({ global_id: 'https://w3id.org/aruna/data/k3V9/01K8Y2', origin: { kind: 'upload', node_id: 'n1' } })
    const root = await render()

    expect(content(root)).toContain('global id https://w3id.org/aruna/data/k3V9/01K8Y2')
    expect(element(root, (node) => node.tag === 'a' && node.props.href === 'https://node.test/api/v1/resolve/k3V9/01K8Y2')).toBeTruthy()
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
