import NameCard from '~/components/card/name.vue'
import { mountWithNuxt } from '../../helpers/component'

describe('components/card/name', () => {
  it('renders name and title in read-only mode', async () => {
    const wrapper = await mountWithNuxt(NameCard, {
      props: {
        name: 'resource-name',
        title: 'Resource Title',
        editable: true,
        editMode: false,
      },
    })

    expect(wrapper.text()).toContain('Name:')
    expect(wrapper.text()).toContain('resource-name')
    expect(wrapper.text()).toContain('Resource Title')
  })

  it('falls back to N/A when title is missing', async () => {
    const wrapper = await mountWithNuxt(NameCard, {
      props: {
        name: 'resource-name',
        title: undefined,
        editable: false,
        editMode: false,
      },
    })

    expect(wrapper.text()).toContain('N/A')
  })

  it('shows editing actions and emits title updates in edit mode', async () => {
    const wrapper = await mountWithNuxt(NameCard, {
      props: {
        name: 'resource-name',
        title: 'Original Title',
        editable: true,
        editMode: true,
      },
    })

    const input = wrapper.get('input')
    await input.setValue('Updated Title')
    await wrapper.get('button').trigger('click')

    expect(wrapper.text()).toContain('Save')
    expect(wrapper.text()).toContain('Cancel')
    expect(wrapper.emitted('update-title')).toEqual([['Updated Title']])
  })
})
