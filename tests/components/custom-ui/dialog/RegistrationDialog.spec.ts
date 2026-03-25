import { beforeEach, describe, expect, it, vi } from 'vitest'
import RegistrationDialog from '~/components/custom-ui/dialog/RegistrationDialog.vue'
import { mountWithNuxt } from '../../../helpers/component'

const { toastMock, handleSubmitMock, useFormMock } = vi.hoisted(() => ({
  toastMock: vi.fn(),
  handleSubmitMock: vi.fn(),
  useFormMock: vi.fn(),
}))

vi.mock('~/components/ui/toast/use-toast', () => ({
  useToast: () => ({
    toast: toastMock,
  }),
}))

vi.mock('vee-validate', () => ({
  useForm: useFormMock,
}))

vi.mock('@vee-validate/zod', () => ({
  toTypedSchema: (schema: unknown) => schema,
}))

describe('RegistrationDialog', () => {
  beforeEach(() => {
    toastMock.mockReset()
    handleSubmitMock.mockReset()
    useFormMock.mockReset()

    useFormMock.mockReturnValue({
      handleSubmit: (callback: (values: Record<string, string>) => Promise<void>) => {
        handleSubmitMock.mockImplementation(() =>
          callback({
            firstName: 'Ada',
            lastName: 'Lovelace',
            displayName: 'Ada Lovelace',
            email: 'ada@example.org',
            project: 'NFDI',
            tosAccepted: true,
          })
        )
        return handleSubmitMock
      },
    })
  })

  it('renders the trigger button and registration copy', async () => {
    const wrapper = await mountWithNuxt(RegistrationDialog, {
      props: {
        initialOpen: false,
        withButton: true,
      },
    })

    expect(wrapper.text()).toContain('Registration')
    expect(wrapper.text()).toContain('Aruna Registration')
    expect(wrapper.text()).toContain('Register for your individual Aruna experience.')
  })

  it('submits registration data and emits closeRegisterDialog on success', async () => {
    const fetchMock = vi.mocked($fetch)
    fetchMock.mockResolvedValueOnce({ userId: 'user-1' })

    const wrapper = await mountWithNuxt(RegistrationDialog, {
      props: {
        initialOpen: true,
        withButton: false,
      },
    })

    await wrapper.get('form').trigger('submit')

    expect(fetchMock).toHaveBeenCalledWith('/api/register', {
      method: 'POST',
      body: {
        displayName: 'Ada Lovelace',
        email: 'ada@example.org',
        project: 'NFDI',
      },
    })
    expect(wrapper.emitted('closeRegisterDialog')).toHaveLength(1)
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ duration: 10000 }))
  })

  it('shows an error toast when registration fails', async () => {
    const fetchMock = vi.mocked($fetch)
    fetchMock.mockRejectedValueOnce(new Error('Registration failed'))

    const wrapper = await mountWithNuxt(RegistrationDialog, {
      props: {
        initialOpen: true,
        withButton: false,
      },
    })

    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('closeRegisterDialog')).toBeUndefined()
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Error',
      description: 'Error: Registration failed',
    })
  })
})
