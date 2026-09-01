import * as VueRuntime from 'vue'
import { defineComponent, h, reactive } from 'vue'
import { describe, expect, it } from 'vitest'
import { compileClientComponent, content, element, moduleDefault, mountApp } from '@/test/clientRender'
import * as EntityTypes from '@/lib/profiles/entityTypes'
import * as Labels from '@/lib/profiles/labels'
import * as Uri from '@/lib/profiles/uri'
import * as Builder from './useProfileBuilder'
import { draftEntity, draftProperty } from './useProfileBuilder'

const EmptyStub = defineComponent(() => () => null)
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const SelectStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  setup: (props, { attrs }) => () => h('select', { ...attrs, value: props.modelValue }),
})
// Renders the tooltip text so a test can read what the control explains.
const TooltipStub = defineComponent({
  props: { label: { type: String, default: '' } },
  setup: (props, { slots }) => () => h('div', [h('span', props.label), slots.default?.()]),
})

const PropertyRuleRow = compileClientComponent(new URL('./PropertyRuleRow.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => EmptyStub }),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Tooltip.vue': moduleDefault(TooltipStub),
  './PropertyRuleCard.vue': moduleDefault(EmptyStub),
  '@/lib/profiles/labels': Labels,
  '@/lib/profiles/entityTypes': EntityTypes,
  '@/lib/profiles/uri': Uri,
  './useProfileBuilder': Builder,
})

describe('PropertyRuleRow', () => {
  it('explains what the obligation control decides', async () => {
    const entity = draftEntity({ type: 'http://schema.org/Dataset', label: 'Root dataset' })
    const property = draftProperty({ label: 'Creator', propertyUri: 'http://schema.org/creator', valueName: 'creator' })
    entity.properties = [property]
    const builder = reactive({ entities: [entity], highlightPropertyUid: null })
    const mounted = await mountApp(PropertyRuleRow, {
      props: { builder, entity, property, index: 0, total: 1 },
    })

    expect(content(mounted.root)).toContain(Labels.OBLIGATION_HELP)
    expect(element(mounted.root, (node) => node.props['data-tour'] === 'profile-obligation')).toBeDefined()
    mounted.app.unmount()
  })
})
