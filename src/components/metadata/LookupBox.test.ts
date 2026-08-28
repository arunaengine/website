import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
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
  typeValue,
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
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Spinner.vue': moduleDefault(EmptyStub),
  '@/lib/lookup/registry': { cancelLookup, searchLookups },
})

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
