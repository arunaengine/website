import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  flush,
  moduleDefault,
  mountApp,
  nodes,
  typeValue,
  type HostNode,
} from '@/test/clientRender'
import type { LookupHit, LookupProviderStatus } from '@/lib/lookup/types'

const cancelLookup = vi.fn()
let status: LookupProviderStatus = 'ok'
let hits: LookupHit[] = []
const searchLookups = vi.fn(async (_kind, _query, update: (value: unknown) => void) => {
  update({ providerId: 'orcid', providerLabel: 'ORCID', status, hits })
})

const InputStub = defineComponent({
  props: { modelValue: { type: [String, Number], default: '' } },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () => h('input', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    })
  },
})
const EmptyStub = defineComponent(() => () => null)

const LookupBox = compileClientComponent(new URL('./LookupBox.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => EmptyStub }),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Spinner.vue': moduleDefault(EmptyStub),
  '@/lib/lookup/registry': { cancelLookup, searchLookups },
})

// A host that writes the picked label back into the shared field, as the entity
// dialog does; the box must not read that answer as the next query.
function hostBox(picked: LookupHit[]) {
  return defineComponent(() => {
    const name = ref('')
    return () => h(LookupBox, {
      kind: 'person',
      modelValue: name.value,
      'onUpdate:modelValue': (value: string) => (name.value = value),
      onSelect: (hit: LookupHit) => {
        picked.push(hit)
        name.value = hit.label
      },
    })
  })
}

function personHit(orcid: string, label: string): LookupHit {
  const id = `https://orcid.org/${orcid}`
  return {
    id,
    label,
    providerId: 'orcid',
    entity: { id, type: 'Person', properties: { name: label }, roles: ['author'] },
    relatedEntities: [],
  }
}

async function press(node: HostNode, key: string) {
  const handler = node.props.onKeydown as (event: { key: string; preventDefault: () => void }) => void
  handler({ key, preventDefault() {} })
  await flush()
}

beforeEach(() => {
  vi.useFakeTimers()
  cancelLookup.mockClear()
  searchLookups.mockClear()
  status = 'ok'
  hits = []
})

afterEach(() => vi.useRealTimers())

describe('LookupBox', () => {
  it('debounces a query for 300 ms and selects a provider result', async () => {
    const selected = vi.fn()
    hits = [{
      id: 'https://orcid.org/0000-0002-1825-0097',
      label: 'Ada Example',
      providerId: 'orcid',
      entity: {
        id: 'https://orcid.org/0000-0002-1825-0097',
        type: 'Person',
        properties: { name: 'Ada Example' },
        roles: ['author'],
      },
      relatedEntities: [],
    }]
    const mounted = await mountApp(LookupBox, { props: { kind: 'person', onSelect: selected } })
    const query = element(mounted.root, (node) => node.tag === 'input')

    await typeValue(query, 'Ada')
    await vi.advanceTimersByTimeAsync(299)
    expect(searchLookups).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await flush()

    expect(searchLookups).toHaveBeenCalledWith('person', 'Ada', expect.any(Function), { limit: 10 })
    await click(button(mounted.root, 'Ada Example'))
    expect(selected).toHaveBeenCalledWith(hits[0])
    mounted.app.unmount()
  })

  it('walks the results with the arrow keys and picks one with Enter', async () => {
    const selected = vi.fn()
    hits = [personHit('0000-0002-1825-0097', 'Ada Example'), personHit('0000-0001-5109-3700', 'Bob Example')]
    const mounted = await mountApp(LookupBox, { props: { kind: 'person', onSelect: selected } })
    const query = element(mounted.root, (node) => node.tag === 'input')

    await typeValue(query, 'Example')
    await vi.advanceTimersByTimeAsync(300)
    await flush()

    await press(query, 'ArrowDown')
    await press(query, 'ArrowDown')
    await press(query, 'Enter')

    expect(selected).toHaveBeenCalledWith(hits[1])
    mounted.app.unmount()
  })

  it('hides the results on Escape and caps the list at six', async () => {
    hits = Array.from({ length: 8 }, (_, index) => personHit(`0000-0002-1825-00${index}`, `Ada ${index}`))
    const mounted = await mountApp(LookupBox, { props: { kind: 'person' } })
    const query = element(mounted.root, (node) => node.tag === 'input')

    await typeValue(query, 'Ada')
    await vi.advanceTimersByTimeAsync(300)
    await flush()

    expect(nodes(mounted.root).filter((node) => node.props.role === 'option')).toHaveLength(6)

    await press(query, 'Escape')

    expect(nodes(mounted.root).filter((node) => node.props.role === 'option')).toHaveLength(0)
    mounted.app.unmount()
  })

  it('keeps a long affiliation on its own line', async () => {
    const affiliation = `Institute of ${'Very Long Names '.repeat(12)}Research`
    hits = [{ ...personHit('0000-0002-1825-0097', 'Ada Example'), description: affiliation }]
    const mounted = await mountApp(LookupBox, { props: { kind: 'person' } })

    await typeValue(element(mounted.root, (node) => node.tag === 'input'), 'Ada')
    await vi.advanceTimersByTimeAsync(300)
    await flush()

    const line = element(mounted.root, (node) => node.props.title === affiliation)
    expect(content(line)).toBe(affiliation)
    expect(String(line.props.class)).toContain('line-clamp-1')

    const row = button(mounted.root, 'Ada Example')
    expect(content(row)).toContain('https://orcid.org/0000-0002-1825-0097')
    expect(String(row.props.class)).toContain('min-w-0')
    const identity = element(mounted.root, (node) => String(node.props.title ?? '').startsWith('Ada Example · '))
    expect(String(identity.props.class)).toContain('truncate')
    mounted.app.unmount()
  })

  it('stops searching once a hit is chosen', async () => {
    const picked: LookupHit[] = []
    hits = [personHit('0000-0002-1825-0097', 'Ada Example')]
    const mounted = await mountApp(hostBox(picked), {})
    const query = element(mounted.root, (node) => node.tag === 'input')

    await typeValue(query, 'Ada')
    await vi.advanceTimersByTimeAsync(300)
    await flush()
    await click(button(mounted.root, 'Ada Example'))
    await vi.advanceTimersByTimeAsync(600)
    await flush()

    expect(picked).toHaveLength(1)
    expect(searchLookups).toHaveBeenCalledTimes(1)
    expect(nodes(mounted.root).filter((node) => node.props.role === 'option')).toHaveLength(0)
    expect(content(mounted.root)).toContain('https://orcid.org/0000-0002-1825-0097')
    mounted.app.unmount()
  })

  it('searches again after the chosen id is cleared', async () => {
    const picked: LookupHit[] = []
    hits = [personHit('0000-0002-1825-0097', 'Ada Example')]
    const mounted = await mountApp(hostBox(picked), {})
    const query = element(mounted.root, (node) => node.tag === 'input')

    await typeValue(query, 'Ada')
    await vi.advanceTimersByTimeAsync(300)
    await flush()
    await click(button(mounted.root, 'Ada Example'))
    await click(element(mounted.root, (node) => node.props['aria-label'] === 'Clear the selected ORCID'))

    expect(content(mounted.root)).not.toContain('https://orcid.org/0000-0002-1825-0097')

    await typeValue(query, 'Bob')
    await vi.advanceTimersByTimeAsync(300)
    await flush()

    expect(searchLookups).toHaveBeenCalledTimes(2)
    expect(nodes(mounted.root).filter((node) => node.props.role === 'option')).toHaveLength(1)
    mounted.app.unmount()
  })

  it('keeps manual entry available when the provider is offline', async () => {
    status = 'offline'
    const mounted = await mountApp(LookupBox, { props: { kind: 'organization' } })

    await typeValue(element(mounted.root, (node) => node.tag === 'input'), 'Example')
    await vi.advanceTimersByTimeAsync(300)
    await flush()

    expect(content(mounted.root)).toContain('ROR is unavailable. Continue with the manual form below.')
    mounted.app.unmount()
  })
})
