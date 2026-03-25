import { flushPromises } from '@vue/test-utils'
import TokenDialog from '~/components/custom-ui/dialog/TokenDialog.vue'
import { mountWithNuxt } from '../../../helpers/component'

const { toastMock, eventBusEmitMock, createUserTokenMock, handleSubmitMock, setFieldValueMock, useFormMock } = vi.hoisted(() => ({
  toastMock: vi.fn(),
  eventBusEmitMock: vi.fn(),
  createUserTokenMock: vi.fn(),
  handleSubmitMock: vi.fn(),
  setFieldValueMock: vi.fn(),
  useFormMock: vi.fn(),
}))

vi.mock('~/components/ui/toast', () => ({
  useToast: () => ({
    toast: toastMock,
  }),
}))

vi.mock('~/composables/api_wrapper', () => ({
  createUserToken: createUserTokenMock,
}))

vi.mock('~/composables/EventBus', () => ({
  default: {
    emit: eventBusEmitMock,
  },
}))

vi.mock('vee-validate', () => ({
  useForm: useFormMock,
}))

vi.mock('@vee-validate/zod', () => ({
  toTypedSchema: (schema: unknown) => schema,
}))

vi.mock('@vueuse/core', () => ({
  useClipboard: () => ({ copy: vi.fn(), copied: { value: false } }),
}))

vi.mock('@internationalized/date', () => ({
  DateFormatter: class {
    format(value: { toString: () => string }) {
      return value.toString()
    }
  },
  getLocalTimeZone: () => 'UTC',
  parseDate: (value: string) => ({ toString: () => value }),
  today: () => ({
    add: () => ({ toString: () => '2025-01-02' }),
  }),
}))

describe('TokenDialog', () => {
  beforeEach(() => {
    toastMock.mockReset()
    eventBusEmitMock.mockReset()
    createUserTokenMock.mockReset()
    handleSubmitMock.mockReset()
    setFieldValueMock.mockReset()
    useFormMock.mockReset()

    vi.stubGlobal('ULID_REGEX', /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/)
    vi.stubGlobal('cn', (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '))

    useFormMock.mockReturnValue({
      handleSubmit: (callback: (values: Record<string, string>) => Promise<void>) => {
        handleSubmitMock.mockImplementation(() =>
          callback({
            tokenName: 'integration-token',
            tokenScope: 'Personal',
            expiryDate: '2025-01-02',
            resourceId: undefined,
            permissionLevel: undefined,
          })
        )
        return handleSubmitMock
      },
      values: {
        tokenScope: 'Personal',
        expiryDate: '2025-01-02',
      },
      setFieldValue: setFieldValueMock,
    })
  })

  it('renders the trigger button and dialog copy', async () => {
    const wrapper = await mountWithNuxt(TokenDialog, {
      props: {
        initialOpen: false,
        withButton: true,
      },
    })

    expect(wrapper.text()).toContain('Create Token')
    expect(wrapper.text()).toContain('Create an individual Aruna access token')
  })

  it('shows token secret and emits updateUser when token creation succeeds', async () => {
    createUserTokenMock.mockResolvedValueOnce({ tokenSecret: 'secret-value' })

    const wrapper = await mountWithNuxt(TokenDialog, {
      props: {
        initialOpen: true,
        withButton: false,
      },
    })

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(createUserTokenMock).toHaveBeenCalledWith('integration-token', undefined, '2025-01-02T00:00:00.000Z')
    expect(eventBusEmitMock).toHaveBeenCalledWith('updateUser')
    expect(wrapper.text()).toContain('Token Secret')
    expect(wrapper.text()).toContain('secret-value')
  })

  it('shows a destructive toast when token creation fails', async () => {
    createUserTokenMock.mockRejectedValueOnce(new Error('Creation failed'))

    const wrapper = await mountWithNuxt(TokenDialog, {
      props: {
        initialOpen: true,
        withButton: false,
      },
    })

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(toastMock).toHaveBeenCalledWith({
      title: 'Error',
      description: 'Creation failed',
      variant: 'destructive',
      duration: 10000,
    })
  })
})
