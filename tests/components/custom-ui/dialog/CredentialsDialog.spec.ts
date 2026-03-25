import CredentialsDialog from '~/components/custom-ui/dialog/CredentialsDialog.vue'
import { mountWithNuxt } from '../../../helpers/component'

describe('CredentialsDialog', () => {
  const baseProps = {
    initialOpen: true,
    withButton: false,
    hostId: 'endpoint-1',
    hostName: 'Primary Endpoint',
    hostUrl: 'https://endpoint.example.org',
    accessKeyId: 'ACCESS123',
    accessSecret: 'SECRET456',
  }

  it('renders credentials and host metadata', async () => {
    const wrapper = await mountWithNuxt(CredentialsDialog, {
      props: baseProps,
    })

    expect(wrapper.text()).toContain('DataProxy Credentials')
    expect(wrapper.text()).toContain('Primary Endpoint')
    expect(wrapper.text()).toContain('endpoint-1')
    expect(wrapper.text()).toContain('https://endpoint.example.org')
    expect(wrapper.text()).toContain('ACCESS123')
    expect(wrapper.text()).toContain('SECRET456')
  })

  it('renders the trigger button when requested', async () => {
    const wrapper = await mountWithNuxt(CredentialsDialog, {
      props: {
        ...baseProps,
        initialOpen: false,
        withButton: true,
      },
    })

    expect(wrapper.text()).toContain('Show Credentials')
  })
})
