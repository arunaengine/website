import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { compileClientComponent, content, element, moduleDefault, mountApp } from '@/test/clientRender'
import * as Storage from '@/lib/storage'
import * as StorageRules from '@/lib/storageRules'
import type { GroupBackendResponse } from '@/lib/api'

const SelectStub = defineComponent({
  props: { modelValue: { type: String, default: '' }, ariaLabel: String, options: { type: Array, default: () => [] } },
  setup: (props) => () =>
    h(
      'select',
      { 'aria-label': props.ariaLabel },
      (props.options as { value: string; label: string }[]).map((option) => h('option', { value: option.value }, option.label)),
    ),
})
const Picker = compileClientComponent(new URL('./RoutingTargetPicker.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/composables/useAruna': { useAruna: () => ({ nodeInfo: ref(null) }) },
  '@/lib/storage': Storage,
  '@/lib/storageRules': StorageRules,
})

const backend = (kind: string, name: string): GroupBackendResponse => ({
  backend_id: name,
  group_id: 'g1',
  kind,
  name,
  public_config: {},
})

describe('RoutingTargetPicker', () => {
  it('lists storages that take new files and leaves out local folders', async () => {
    const { root } = await mountApp(
      defineComponent(() => () =>
        h(Picker, { modelValue: null, backends: [backend('s3', 'spire'), backend('fs', 'raw-folder')] }),
      ),
    )
    const options = content(element(root, (node) => node.tag === 'select'))
    expect(options).toContain('spire')
    expect(options).not.toContain('raw-folder')
  })
})
