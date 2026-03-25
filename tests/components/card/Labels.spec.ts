import LabelsCard from '~/components/card/Labels.vue'
import { v2KeyValueVariant } from '~/composables/aruna_api_json'
import { mountWithNuxt } from '../../helpers/component'

describe('components/card/Labels', () => {
  it('renders only label variants and keeps static labels marked', async () => {
    const wrapper = await mountWithNuxt(LabelsCard, {
      props: {
        key_values: [
          { key: 'species', value: 'human', variant: v2KeyValueVariant.KEY_VALUE_VARIANT_LABEL },
          { key: 'stage', value: '{"status":"complete"}', variant: v2KeyValueVariant.KEY_VALUE_VARIANT_STATIC_LABEL },
          { key: 'hook', value: 'ignored', variant: v2KeyValueVariant.KEY_VALUE_VARIANT_HOOK },
        ],
      },
    })

    expect(wrapper.text()).toContain('species')
    expect(wrapper.text()).toContain('human')
    expect(wrapper.text()).toContain('stage')
    expect(wrapper.html()).toContain('<pre>{')
    expect(wrapper.text()).not.toContain('hook')
  })

  it('renders an empty table when no labels are available', async () => {
    const wrapper = await mountWithNuxt(LabelsCard, {
      props: {
        key_values: undefined,
      },
    })

    expect(wrapper.text()).toContain('Key')
    expect(wrapper.text()).toContain('Value')
    expect(wrapper.text()).toContain('Static')
  })
})
