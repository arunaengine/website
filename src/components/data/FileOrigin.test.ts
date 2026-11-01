import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { OriginResponse } from '@/lib/api'
import * as ContentIdentity from '@/lib/contentIdentity'
import * as FileOriginLib from '@/lib/fileOrigin'
import * as Utils from '@/lib/utils'
import { button, click, compileClientComponent, content, element, flush, mountApp, moduleDefault } from '@/test/clientRender'

const origin = ref<OriginResponse | null>(null)
const state = ref('ready')
const downloadUrl = vi.fn(async () => 'https://s3.test/signed')
const getRun = vi.fn(async (_id: string): Promise<{ logical_job_id?: string }> => ({}))
const getTask = vi.fn(async (_id: string, _view: string) => ({ name: 'Annotate with Bakta', state: 'COMPLETE' }))
const users = ref<Record<string, { name: string }>>({})
const resolveUsers = vi.fn(async (ids: string[]) => {
  users.value = { ...users.value, ...Object.fromEntries(ids.map((id) => [id, { name: 'Ada Lovelace' }])) }
})
const Icon = (name: string) => defineComponent({ inheritAttrs: false, setup: (_, { attrs }) => () => h('i', { ...attrs, 'data-icon': name }) })

const Marker = (text: string) => defineComponent({ props: { globalUrl: String }, setup: (props) => () => h('section', `${text} ${props.globalUrl ?? ''}`) })

const component = compileClientComponent(new URL('./FileOrigin.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/ExternalLink.vue': { __esModule: true, default: defineComponent({ props: { href: String, label: String }, setup: (props) => () => h('a', { href: props.href }, props.label) }) },
  'vue-router': { RouterLink: defineComponent({ props: { to: Object }, setup: (props, { slots }) => () => h('a', { to: props.to }, slots.default?.()) }) },
  '@lucide/vue': { CircleCheck: Icon('check'), CircleX: Icon('cross'), LoaderCircle: Icon('loader') },
  '@/composables/useTes': { useTes: () => ({ getTask }) },
  '@/lib/tes': { TES_STATE_META: { COMPLETE: { label: 'Complete' }, RUNNING: { label: 'Running' }, SYSTEM_ERROR: { label: 'System error' } } },
  '@/components/data/OriginLine.vue': moduleDefault(
    defineComponent({ props: { origin: Object, short: Boolean }, setup: (props) => () => h('section', `origin line ${(props.origin as { user?: string } | undefined)?.user ?? ''}`) }),
  ),
  '@/components/distributed/GlobalId.vue': moduleDefault(Marker('global id')),
  '@/components/data/ProvenanceView.vue': moduleDefault(
    defineComponent({ props: { start: Object }, setup: (props) => () => h('section', `provenance ${(props.start as { id: string }).id}`) }),
  ),
  '@/components/ui/Button.vue': moduleDefault(defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()) })),
  '@/components/ui/DetailDialog.vue': moduleDefault(
    defineComponent({ props: { open: Boolean }, setup: (props, { slots }) => () => (props.open ? h('dialog', [slots.header?.(), slots.default?.()]) : null) }),
  ),
  '@/composables/useAruna': { useAruna: () => ({ realmInfo: ref({ realm_id: 'realm1' }), getRun, sessionEpoch: ref(1) }) },
  '@/lib/contentIdentity': ContentIdentity,
  '@/components/ui/Spinner.vue': moduleDefault(defineComponent(() => () => h('i'))),
  '@/composables/useS3': { useS3: () => ({ downloadUrl }), s3ErrorMessage: (cause: unknown) => String(cause) },
  '@/composables/useDatabases': { useDatabases: () => ({ rows: ref([]) }) },
  '@/composables/useUserDirectory': { useUserDirectory: () => ({ resolveUsers, cachedUser: (id: string) => users.value[id] ?? null }) },
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

  it('names the user who uploaded the version', async () => {
    state.value = 'ready'
    origin.value = response({ created_by: '01M69K804AA1JFYFDKPZJ69ZVN', origin: { kind: 'upload', node_id: 'n1' } })
    const root = await render()
    await flush()

    expect(resolveUsers).toHaveBeenCalledWith(['01M69K804AA1JFYFDKPZJ69ZVN'])
    expect(content(root)).toContain('origin line Ada Lovelace')
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
  it('hands its answer to the details, which show the identifiers, and adds them to datasets', async () => {
    const url = 'https://www.ebi.ac.uk/biosamples/samples/SAMN15803895'
    state.value = 'ready'
    origin.value = response({
      origin: { kind: 'source' },
      bucket_metadata: { database: true, dataset: 'd1' },
      description: { title: 'BakRep', identifiers: [] },
      identifiers: [{ name: 'BioSample', value: 'SAMN15803895', url, target: 'key' }],
      projection: [{ property: 'identifier', name: 'BioSample', value: 'SAMN15803895', url }],
    })
    const handed: unknown[] = []
    const { root } = await mountApp(component, {
      props: { target: { bucket: 'spire', key: 'a.tsv', versionId: null }, onOrigin: (value: unknown) => handed.push(value) },
    })

    expect(handed).toEqual([origin.value])
    expect(content(root)).not.toContain('Identifier: BioSample')
    expect(content(root)).toContain('identifierBioSample SAMN15803895')
  })
})

describe('file origin provenance', () => {
  it('opens where the file came from at its exact version id', async () => {
    state.value = 'ready'
    origin.value = response({ origin: { kind: 'job', run_id: 'r1' } })
    const root = await render()
    expect(content(root)).not.toContain('provenance https://')

    await click(button(root, 'Show provenance'))
    expect(content(root)).toContain('provenance https://w3id.org/aruna/data/arn:aruna:realm1:node1:s3/spire/a.tsv@v1')
  })

  it('starts a distributed file at its global id', async () => {
    state.value = 'ready'
    origin.value = response({ global_id: 'https://w3id.org/aruna/data/realm1/01K8Y2' })
    const root = await render()
    await click(button(root, 'Show provenance'))

    expect(content(root)).toContain('provenance https://w3id.org/aruna/data/realm1/01K8Y2')
  })
})

describe('file origin run', () => {
  it('names the run that wrote the file as one chip with its state, linking the run', async () => {
    state.value = 'ready'
    getRun.mockResolvedValueOnce({ logical_job_id: 't1' })
    origin.value = response({ origin: { kind: 'job', run_id: 'r1' } })
    const root = await render()
    await flush()

    const chip = element(root, (node) => node.tag === 'a' && content(node).includes('Annotate with Bakta'))
    expect(chip.props.to).toEqual({ name: 'task', params: { taskId: 't1' } })
    expect(element(chip, (node) => node.props['data-icon'] === 'check').props['aria-label']).toBe('Complete')
    expect(content(root)).toContain('Written by')
    expect(content(root)).not.toContain('origin line')
    expect(getTask).toHaveBeenCalledWith('t1', 'BASIC')
  })

  it('names the person who started the run beside its chip', async () => {
    state.value = 'ready'
    getRun.mockResolvedValueOnce({ logical_job_id: 't1' })
    origin.value = response({ created_by: 'u1', origin: { kind: 'job', run_id: 'r1', started_by: 'u7' } })
    const root = await render()
    await flush()

    expect(resolveUsers).toHaveBeenCalledWith(['u1', 'u7'])
    expect(content(root)).toContain('Started by Ada Lovelace')
  })

  it('keeps the run id line when the run cannot be read', async () => {
    state.value = 'ready'
    getRun.mockRejectedValueOnce(new Error('403'))
    origin.value = response({ origin: { kind: 'job', run_id: 'r2' } })
    const root = await render()
    await flush()

    expect(content(root)).toContain('origin line')
    expect(content(root)).not.toContain('Written by')
  })
})
