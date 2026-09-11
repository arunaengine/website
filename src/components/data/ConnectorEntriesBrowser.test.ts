import { defineComponent, h } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as Api from '@/lib/api'
import * as Refresh from '@/composables/useRefresh'
import * as Utils from '@/lib/utils'
import {
  click,
  compileClientComponent,
  content,
  element,
  flush,
  mountApp,
  moduleDefault,
  typeValue,
  type HostNode,
} from '@/test/clientRender'
import type { ConnectorEntry } from '@/lib/api'

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

const listConnectorEntries = vi.fn()

const browser = compileClientComponent(new URL('./ConnectorEntriesBrowser.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
  '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/components/ui/RefreshButton.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Spinner.vue': moduleDefault(Slotted('span')),
  '@/components/data/ObjectIcon.vue': moduleDefault(IconStub),
  '@/composables/useAruna': {
    isUnsupportedEndpoint: () => false,
    useAruna: () => ({ listConnectorEntries }),
  },
  '@/composables/useRefresh': Refresh,
  '@/lib/api': Api,
  '@/lib/utils': Utils,
})

function file(name: string): ConnectorEntry {
  return { name, path: name, kind: 'file', size: 12 }
}

async function render(entries: ConnectorEntry[]) {
  listConnectorEntries.mockResolvedValue({ entries, truncated: false })
  const added: Array<{ files: ConnectorEntry[]; dirs: ConnectorEntry[] }> = []
  const { root } = await mountApp(browser, {
    props: {
      groupId: 'g-1',
      connectorId: 'c-1',
      selectable: true,
      onAdd: (selection: { files: ConnectorEntry[]; dirs: ConnectorEntry[] }) => added.push(selection),
    },
  })
  await flush()
  return { root, added }
}

function filterInput(root: HostNode): HostNode {
  return element(root, (node) => node.tag === 'input' && node.props['aria-label'] === 'Filter entries')
}

describe('connector entries browser', () => {
  it('shows only the entries matching the filter', async () => {
    const { root } = await render([file('reads.fastq'), file('Notes.txt'), file('reads.bam')])

    await typeValue(filterInput(root), 'READS')

    const text = content(root)
    expect(text).toContain('reads.fastq')
    expect(text).toContain('reads.bam')
    expect(text).not.toContain('Notes.txt')
  })

  it('says when the filter hides every entry', async () => {
    const { root } = await render([file('reads.fastq')])

    await typeValue(filterInput(root), 'scan')

    expect(content(root)).toContain('No entries match.')
    expect(content(root)).not.toContain('This folder is empty.')
  })

  it('adds a filtered entry to the basket', async () => {
    const { root, added } = await render([file('reads.fastq'), file('Notes.txt')])

    await typeValue(filterInput(root), 'reads')
    const checkbox = element(
      root,
      (node) => node.tag === 'input' && node.props['aria-label'] === 'Select reads.fastq',
    )
    ;(checkbox.props.onChange as (event: unknown) => void)({ target: { checked: true } })
    await flush()
    await click(element(root, (node) => node.tag === 'button' && content(node).trim().startsWith('Add')))

    expect(added).toHaveLength(1)
    expect(added[0].files.map((entry) => entry.name)).toEqual(['reads.fastq'])
  })

  it('clears the filter when the folder changes', async () => {
    const { root } = await render([
      { name: 'runs', path: 'runs', kind: 'dir' },
      file('reads.fastq'),
    ])

    await typeValue(filterInput(root), 'runs')
    listConnectorEntries.mockResolvedValue({ entries: [file('inner.txt')], truncated: false })
    await click(element(root, (node) => node.tag === 'button' && content(node).trim() === 'runs/'))
    await flush()

    expect(filterInput(root).props.value).toBe('')
    expect(content(root)).toContain('inner.txt')
  })
})
