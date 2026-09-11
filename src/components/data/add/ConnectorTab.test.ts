import { computed, defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it } from 'vitest'
import {
  click,
  compileClientComponent,
  content,
  element,
  moduleDefault,
  mountApp,
  typeValue,
  type HostNode,
} from '@/test/clientRender'
import { STRATEGY_OPTIONS, type ConnectorStagingRow } from './useConnectorSource'

const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const InputStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  inheritAttrs: false,
  setup: (props, { attrs, emit }) => () =>
    h('input', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: HostNode }) => emit('update:modelValue', String(event.target.value)),
    }),
})
const BrowserStub = defineComponent(() => () => h('div', 'entries browser'))

const ConnectorTab = compileClientComponent(new URL('./ConnectorTab.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Select.vue': moduleDefault(Slotted('select')),
  '@/components/ui/EmptyState.vue': moduleDefault(Slotted('div')),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/components/ui/Spinner.vue': moduleDefault(Slotted('span')),
  '@/components/groups/GroupSelect.vue': moduleDefault(Slotted('select')),
  '@/components/data/ConnectorEntriesBrowser.vue': moduleDefault(BrowserStub),
  '@/lib/connectivity': {
    OFFLINE_WRITE_HINT: 'offline',
    useConnectivity: () => ({ writesDisabled: ref(false) }),
  },
  './useConnectorSource': { STRATEGY_OPTIONS },
})

function fakeSource(rows: ConnectorStagingRow[]) {
  const connectorPath = ref('')
  return {
    groupSel: ref('g-1'),
    groupOptions: computed(() => [{ value: 'g-1', label: 'Reef' }]),
    connectors: ref([{ connector_id: 'c-1', name: 'archive', kind: 's3' }]),
    connectorsLoading: ref(false),
    connectorsError: ref(null),
    registerOpen: ref(false),
    connectorSel: ref('c-1'),
    connectorOptions: computed(() => [{ value: 'c-1', label: 'archive (s3)' }]),
    connectorStrategy: ref('snapshot'),
    entriesUnsupported: ref(false),
    entriesListingFailed: ref(false),
    connectorPath,
    connectorPathError: computed(() => false),
    existingConnectorPaths: computed(() => new Set<string>()),
    selectionRows: () => [],
    typedPathRows: () => (connectorPath.value.trim() ? rows : []),
  }
}

async function render(rows: ConnectorStagingRow[] = []) {
  const added: ConnectorStagingRow[][] = []
  const { root } = await mountApp(ConnectorTab, {
    props: {
      source: fakeSource(rows),
      onAdd: (staged: ConnectorStagingRow[]) => added.push(staged),
    },
  })
  return { root, added }
}

function pathInput(root: HostNode): HostNode {
  return element(root, (node) => node.tag === 'input' && node.props.placeholder === 'folder/file.fastq.gz')
}

const row: ConnectorStagingRow = {
  source: 'raw/reads.fastq',
  strategy: 'snapshot',
  groupId: 'g-1',
  connectorId: 'c-1',
  connectorName: 'archive',
}

describe('connector tab', () => {
  it('offers the source path while browsing works', async () => {
    const { root } = await render()

    expect(content(root)).toContain('entries browser')
    expect(content(root)).toContain('Source path')
    expect(content(root)).not.toContain('not supported by this node yet')
    expect(pathInput(root)).toBeTruthy()
  })

  it('adds a typed source path', async () => {
    const { root, added } = await render([row])

    await typeValue(pathInput(root), 'raw/reads.fastq')
    await click(element(root, (node) => node.tag === 'button' && content(node).trim().startsWith('Add')))

    expect(added).toEqual([[row]])
  })
})
