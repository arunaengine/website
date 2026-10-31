import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as GraphIri from '@/lib/graphIri'
import * as Pid from '@/lib/pid'
import { compileClientComponent, content, flush, moduleDefault, mountApp } from '@/test/clientRender'

const list = vi.fn()
const Slotted = defineComponent((_, { slots }) => () => h('span', slots.default?.()))
const CopyStub = defineComponent({ props: { value: String, label: String }, setup: (props) => () => h('button', { 'data-copy': props.value }, props.label) })

const Row = compileClientComponent(new URL('./PersistentIdRow.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Badge.vue': moduleDefault(Slotted),
  '@/components/ui/CopyButton.vue': moduleDefault(CopyStub),
  '@/composables/useAruna': { useAruna: () => ({ apiBaseUrl: ref('/api/v1'), authToken: ref('t'), sessionEpoch: ref(0) }) },
  '@/lib/graphIri': GraphIri,
  '@/lib/pid': { ...Pid, listPersistentIds: list },
})

describe('persistent ID row', () => {
  it('shows the registered PID with copy and its state', async () => {
    list.mockResolvedValueOnce([{ value: 'https://pid.example/21.T/abc', state: 'active' }])
    const { root } = await mountApp(Row, { props: { documentId: 'doc-1' } })
    await flush()

    const text = content(root)
    expect(text).toContain('Persistent ID')
    expect(text).toContain('https://pid.example/21.T/abc')
    expect(text).toContain('Copy persistent ID')
    expect(text).toContain(Pid.pidStateMeta('active').label)
    expect(list).toHaveBeenCalledWith('doc-1', { baseUrl: '/api/v1', token: 't' })
  })

  it('keeps the dataset IRI and an unknown state when the status cannot be read', async () => {
    list.mockRejectedValueOnce(new Error('offline'))
    const { root } = await mountApp(Row, { props: { documentId: 'doc-2' } })
    await flush()

    expect(content(root)).toContain(GraphIri.graphIriFor('doc-2'))
    expect(content(root)).toContain(Pid.pidStateMeta('unknown').label)
  })
})
