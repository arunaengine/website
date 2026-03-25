import InternalRelationsCard from '~/components/card/internal_relations.vue'
import {
  v2InternalRelationVariant,
  v2RelationDirection,
  v2ResourceVariant,
} from '~/composables/aruna_api_json'
import { mountWithNuxtSuspense } from '../../helpers/component'
import { createCollectionResource, createObjectResource } from '../../helpers/resource'

describe('components/card/internal_relations', () => {
  it('fetches related resources and renders parent relation metadata', async () => {
    const fetchMock = vi.mocked($fetch)
    fetchMock.mockResolvedValueOnce([
      {
        resource: createCollectionResource({
          id: 'collection-1',
          title: 'Collection Title',
          name: 'collection-name',
        }),
      },
    ])

    const wrapper = await mountWithNuxtSuspense(InternalRelationsCard, {
      props: {
        relations: [
          {
            resourceId: 'collection-1',
            definedVariant: v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_BELONGS_TO,
            direction: v2RelationDirection.RELATION_DIRECTION_INBOUND,
          },
        ],
      },
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/resources', {
      query: {
        resourceIds: ['collection-1'],
      },
    })
    expect(wrapper.text()).toContain('Collection Title')
    expect(wrapper.text()).toContain('Collection')
    expect(wrapper.text()).toContain('Parent')
    expect(wrapper.html()).toContain('/objects/collection-1')
  })

  it('renders custom relation labels and pagination controls for larger lists', async () => {
    const fetchMock = vi.mocked($fetch)
    fetchMock.mockResolvedValueOnce([
      {
        resource: createObjectResource({
          id: 'object-1',
          name: 'file.txt',
        }),
      },
    ])

    const relations = Array.from({ length: 11 }, (_, index) => ({
      resourceId: `object-${index}`,
      definedVariant: v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_CUSTOM,
      customVariant: 'Derived',
      direction: v2RelationDirection.RELATION_DIRECTION_OUTBOUND,
      resourceVariant: v2ResourceVariant.RESOURCE_VARIANT_OBJECT,
    }))

    const wrapper = await mountWithNuxtSuspense(InternalRelationsCard, {
      props: {
        relations,
      },
    })

    expect(wrapper.text()).toContain('Page size: 10')
    expect(wrapper.text()).toContain('Derived')
    expect(wrapper.find('[data-test="select-trigger"]').exists()).toBe(true)
  })
})
