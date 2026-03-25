import HooksCard from '~/components/card/hooks.vue'
import { v2KeyValueVariant } from '~/composables/aruna_api_json'
import { mountWithNuxt } from '../../helpers/component'

describe('components/card/hooks', () => {
  it('renders only hook-related entries and shows hook status rows', async () => {
    const wrapper = await mountWithNuxt(HooksCard, {
      props: {
        key_values: [
          { key: 'validate', value: 'enabled', variant: v2KeyValueVariant.KEY_VALUE_VARIANT_HOOK },
          { key: 'validate-status', value: 'ok', variant: v2KeyValueVariant.KEY_VALUE_VARIANT_HOOK_STATUS },
          { key: 'label', value: 'ignored', variant: v2KeyValueVariant.KEY_VALUE_VARIANT_LABEL },
        ],
      },
    })

    expect(wrapper.text()).toContain('validate')
    expect(wrapper.text()).toContain('enabled')
    expect(wrapper.text()).toContain('validate-status')
    expect(wrapper.text()).toContain('ok')
    expect(wrapper.text()).not.toContain('label')
  })
})
