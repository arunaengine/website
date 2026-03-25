import ExternalRelationsCard from '~/components/card/external_relations.vue'
import { v2ExternalRelationVariant } from '~/composables/aruna_api_json'
import { mountWithNuxt } from '../../helpers/component'

describe('components/card/external_relations', () => {
  it('renders url relations as links', async () => {
    const wrapper = await mountWithNuxt(ExternalRelationsCard, {
      props: {
        relations: [
          {
            identifier: 'https://example.org/reference',
            definedVariant: v2ExternalRelationVariant.EXTERNAL_RELATION_VARIANT_URL,
          },
        ],
      },
    })

    expect(wrapper.text()).toContain('https://example.org/reference')
    expect(wrapper.text()).toContain('URL')
    expect(wrapper.html()).toContain('href="https://example.org/reference"')
  })

  it('renders custom relation labels and pagination controls for longer lists', async () => {
    const relations = Array.from({ length: 11 }, (_, index) => ({
      identifier: `doi:${index}`,
      definedVariant: v2ExternalRelationVariant.EXTERNAL_RELATION_VARIANT_CUSTOM,
      customVariant: 'DOI',
    }))

    const wrapper = await mountWithNuxt(ExternalRelationsCard, {
      props: {
        relations,
      },
    })

    expect(wrapper.text()).toContain('Page size: 10')
    expect(wrapper.text()).toContain('doi:0')
    expect(wrapper.text()).toContain('DOI')
    expect(wrapper.find('[data-test="select-trigger"]').exists()).toBe(true)
  })
})
