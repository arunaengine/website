import ObjectDisplay from '~/components/modal/ObjectDisplay.vue'
import { mountWithNuxt } from '../../helpers/component'

const closeModalMock = vi.hoisted(() => vi.fn())

vi.stubGlobal('closeModal', closeModalMock)

describe('components/modal/ObjectDisplay', () => {
  beforeEach(() => {
    closeModalMock.mockReset()
    vi.stubGlobal('closeModal', closeModalMock)
  })

  it('renders created resource details and progress state', async () => {
    const wrapper = await mountWithNuxt(ObjectDisplay, {
      props: {
        modalId: 'created-resource-modal',
        object: {
          id: 'object-1',
          name: 'object-name',
          title: 'Object Title',
          dataLicenseTag: 'CC-BY',
        },
        progress: 40,
        errorMsg: undefined,
      },
    })

    expect(wrapper.text()).toContain('Your Created Resource:')
    expect(wrapper.text()).toContain('object-1')
    expect(wrapper.text()).toContain('object-name')
    expect(wrapper.text()).toContain('Object Title')
    expect(wrapper.text()).toContain('40%')
    expect(wrapper.text()).toContain('Please wait for your upload to finish')
    expect(wrapper.html()).toContain('/objects/object-1')
    const actionButtons = wrapper.findAll('button')
    expect(actionButtons[1]?.attributes('disabled')).toBeDefined()
  })

  it('shows success state and allows closing when upload is complete', async () => {
    const wrapper = await mountWithNuxt(ObjectDisplay, {
      props: {
        modalId: 'completed-resource-modal',
        object: {
          id: 'object-2',
          name: 'object-name-2',
          title: 'Second Object',
          dataLicenseTag: 'CC-BY',
        },
        progress: 100,
        errorMsg: undefined,
      },
    })

    const closeButtons = wrapper.findAll('button').filter(button => button.text().includes('Close'))
    await closeButtons[0].trigger('click')

    expect(closeButtons[0].attributes('disabled')).toBeUndefined()
  })

  it('renders error content instead of resource details', async () => {
    const wrapper = await mountWithNuxt(ObjectDisplay, {
      props: {
        modalId: 'error-modal',
        object: undefined,
        progress: 0,
        errorMsg: '<strong>Upload failed</strong>',
      },
    })

    expect(wrapper.html()).toContain('<strong>Upload failed</strong>')
    expect(wrapper.text()).not.toContain('Your Created Resource:')
  })
})
