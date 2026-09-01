import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  moduleDefault,
  mountApp,
  typeValue,
} from '@/test/clientRender'
import { errorMessage } from '@/lib/utils'

const createS3Credentials = vi.fn(async () => ({ access_key_id: 'AK1', access_secret: 'S3CR3T' }))
const createUserSession = vi.fn(async () => ({
  session_id: 's1',
  kind: 'api' as const,
  label: 'CI runner',
  token: 'bearer-value',
  expires_at: new Date(Date.now() + 3_600_000).toISOString(),
}))

const Passthrough = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const InputStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h('input', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    }),
})
const SecretStub = defineComponent({
  props: { secret: { type: String, default: '' } },
  setup: (props) => () => h('div', props.secret),
})
const Empty = defineComponent(() => () => null)
const icons = new Proxy({}, { get: () => Empty })

const CreateCredentialDialog = compileClientComponent(
  new URL('./CreateCredentialDialog.vue', import.meta.url),
  {
    vue: VueRuntime,
    '@lucide/vue': icons,
    '@/components/ui/Dialog.vue': moduleDefault(Passthrough),
    '@/components/ui/DialogContent.vue': moduleDefault(Passthrough),
    '@/components/ui/DialogHeader.vue': moduleDefault(Passthrough),
    '@/components/ui/DialogTitle.vue': moduleDefault(Passthrough),
    '@/components/ui/DialogDescription.vue': moduleDefault(Passthrough),
    '@/components/ui/DialogFooter.vue': moduleDefault(Passthrough),
    '@/components/ui/DialogClose.vue': moduleDefault(Passthrough),
    '@/components/ui/Button.vue': moduleDefault(ButtonStub),
    '@/components/ui/Input.vue': moduleDefault(InputStub),
    '@/components/ui/Notice.vue': moduleDefault(Passthrough),
    '@/components/ui/Select.vue': moduleDefault(Empty),
    '@/components/ui/CopyButton.vue': moduleDefault(Empty),
    '@/components/groups/GroupSelect.vue': moduleDefault(Empty),
    '@/components/groups/CreateGroupDialog.vue': moduleDefault(Empty),
    '@/components/onboarding/SecretPanel.vue': moduleDefault(SecretStub),
    '@/composables/useAruna': {
      useAruna: () => ({
        myGroups: ref([{ id: 'g1', name: 'Genomics' }]),
        userInfo: ref(null),
        saving: ref(false),
        createS3Credentials,
      }),
    },
    '@/composables/useS3': { useS3: () => ({ connectedEndpoint: ref('https://s3.test') }) },
    '@/composables/useUserSessions': { useUserSessions: () => ({ create: createUserSession }) },
    '@/lib/utils': { errorMessage },
  },
)

beforeEach(() => {
  createS3Credentials.mockClear()
  createUserSession.mockClear()
})

describe('CreateCredentialDialog', () => {
  it('opens on the s3 key type and offers the bearer one', async () => {
    const { root } = await mountApp(CreateCredentialDialog, { props: { open: true } })

    const text = content(root)
    expect(text).toContain('Create an S3 access key')
    expect(text).toContain('Bearer token')
    expect(text).toContain('Path restrictions (optional)')
  })

  it('renames itself for the bearer type', async () => {
    const { root } = await mountApp(CreateCredentialDialog, { props: { open: true } })

    await click(button(root, 'Bearer token'))

    const text = content(root)
    expect(text).toContain('Create a bearer token')
    expect(text).toContain('It cannot sign S3 requests.')
    expect(text).not.toContain('Path restrictions (optional)')
  })

  it('needs a label before it mints a bearer token', async () => {
    const { root } = await mountApp(CreateCredentialDialog, { props: { open: true } })
    await click(button(root, 'Bearer token'))

    await click(button(root, 'Create'))

    expect(createUserSession).not.toHaveBeenCalled()
  })

  it('mints an api session and shows its token once', async () => {
    const { root } = await mountApp(CreateCredentialDialog, { props: { open: true } })
    await click(button(root, 'Bearer token'))

    await typeValue(element(root, (node) => node.tag === 'input'), 'CI runner')
    await click(button(root, 'Create'))

    expect(createUserSession).toHaveBeenCalledWith({
      kind: 'api',
      label: 'CI runner',
      expires_in_seconds: 86400,
    })
    expect(content(root)).toContain('bearer-value')
    expect(content(root)).toContain('Authorization: Bearer')
  })
})
