import ResourceCard from '~/components/card/resource.vue'
import { createObjectResource, createProjectResource, modelsv2Status, v2DataClass } from '../../helpers/resource'
import { mountWithDefaults } from '../../helpers/component'

describe('components/card/resource', () => {
  it('renders title, id, stats, and labels for hierarchical resources', () => {
    const wrapper = mountWithDefaults(ResourceCard, {
      props: {
        resource: createProjectResource({
          id: 'project-123',
          title: 'Project Atlas',
          description: 'A concise description',
          keyValues: [
            { key: 'species', value: 'human' },
            { key: 'assay', value: '' },
          ],
          stats: {
            size: '2048',
            count: '7',
            lastUpdated: '2024-01-01T00:00:00.000Z',
          },
          dataClass: v2DataClass.DATA_CLASS_PUBLIC,
        }),
      },
      global: {
        stubs: {
          Badge: { template: '<span class="badge"><slot /></span>' },
        },
      },
    })

    expect(wrapper.text()).toContain('Project Atlas')
    expect(wrapper.text()).toContain('project-123')
    expect(wrapper.text()).toContain('Public')
    expect(wrapper.text()).toContain('Children: 7')
    expect(wrapper.text()).toContain('2 KB')
    expect(wrapper.text()).toContain('species')
    expect(wrapper.text()).toContain('human')
    expect(wrapper.text()).toContain('assay')
  })

  it('truncates long descriptions and omits children count for objects', () => {
    const wrapper = mountWithDefaults(ResourceCard, {
      props: {
        resource: createObjectResource({
          description: 'x'.repeat(520),
          contentLen: '1024',
        }),
      },
      global: {
        stubs: {
          Badge: { template: '<span class="badge"><slot /></span>' },
        },
      },
    })

    expect(wrapper.text()).toContain('1 KB')
    expect(wrapper.text()).not.toContain('Children:')
    expect(wrapper.text()).toContain(`${'x'.repeat(512)} ...`)
  })

  it('falls back to name and marks deleted entries visually', () => {
    const wrapper = mountWithDefaults(ResourceCard, {
      props: {
        resource: createProjectResource({
          title: '',
          name: 'fallback-name',
          status: modelsv2Status.STATUS_DELETED,
          dataClass: v2DataClass.DATA_CLASS_PRIVATE,
        }),
      },
      global: {
        stubs: {
          Badge: { template: '<span class="badge"><slot /></span>' },
        },
      },
    })

    expect(wrapper.text()).toContain('fallback-name')
    expect(wrapper.text()).toContain('Private')
    expect(wrapper.get('div').classes()).toContain('border-l-destructive')
  })
})
