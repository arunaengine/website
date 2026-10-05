import * as VueRuntime from 'vue'
import { defineComponent, h, ref, type Ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Api from '@/lib/api'
import type { TokenBucketsState } from '@/composables/useTokenBuckets'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  flush,
  moduleDefault,
  mountApp,
  typeValue,
  type HostNode,
} from '@/test/clientRender'
import { errorMessage } from '@/lib/utils'

const createS3Credentials = vi.fn<(input: Api.CreateS3CredentialsRequest) => Promise<Api.CreateS3CredentialsResponse>>(
  async () => ({ access_key_id: 'AK1', access_secret: 'S3CR3T' }),
)
const TOKEN = 'canary-session-token'
const tokenChoices = ref<string[]>([])
const tokenState = ref<TokenBucketsState>('idle')
let tokenActive: Ref<boolean> | null = null
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
const GroupSelectStub = defineComponent({
  emits: ['update:modelValue'],
  setup: (_, { emit }) => () => h('button', { onClick: () => emit('update:modelValue', 'g1') }, 'Pick Genomics'),
})
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
    '@/components/ui/Spinner.vue': moduleDefault(Empty),
    '@/components/ui/CopyButton.vue': moduleDefault(Empty),
    '@/components/groups/GroupSelect.vue': moduleDefault(GroupSelectStub),
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
    '@/composables/useTokenBuckets': {
      useTokenBuckets: (_group: Ref<string>, active: Ref<boolean>) => {
        tokenActive = active
        return { buckets: tokenChoices, state: tokenState, error: ref(null), unchecked: ref(0), partial: ref(false) }
      },
    },
    '@/lib/api': Api,
    '@/lib/utils': { errorMessage },
  },
)

beforeEach(() => {
  createS3Credentials.mockClear()
  createUserSession.mockClear()
  tokenChoices.value = ['reef', 'kelp']
  tokenState.value = 'ready'
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// Opens the dialog through its prop, as a page does, so closing it can be observed.
async function openDialog() {
  const open = ref(true)
  const host = defineComponent({ setup: () => () => h(CreateCredentialDialog, { open: open.value }) })
  const { root } = await mountApp(host)
  return { root, open }
}

async function chooseBucket(root: HostNode, name: string) {
  await click(button(root, 'Pick Genomics'))
  await click(button(root, 'Encrypted buckets (optional)'))
  const row = element(root, (node) => node.tag === 'label' && content(node).includes(name))
  await click(element(row, (node) => node.tag === 'input'))
}

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

  it('asks for bucket choices only while the encrypted section is open', async () => {
    const { root } = await openDialog()
    await click(button(root, 'Pick Genomics'))
    expect(tokenActive?.value).toBe(false)

    await click(button(root, 'Encrypted buckets (optional)'))

    expect(tokenActive?.value).toBe(true)
    expect(content(root)).toContain('reef')
  })

  it('sends no encrypted buckets unless one is chosen', async () => {
    const { root } = await openDialog()
    await click(button(root, 'Pick Genomics'))
    await click(button(root, 'Create'))

    expect(createS3Credentials.mock.calls[0][0]).not.toHaveProperty('encrypted_buckets')
  })

  it('shows the session token once and forgets it when the dialog closes', async () => {
    const storage = { setItem: vi.fn(), getItem: vi.fn(), removeItem: vi.fn() }
    const indexedDB = { open: vi.fn() }
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('sessionStorage', storage)
    vi.stubGlobal('indexedDB', indexedDB)
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) => vi.spyOn(console, level))
    createS3Credentials.mockResolvedValueOnce({ access_key_id: 'AK2', access_secret: 'SECRET2', session_token: TOKEN })
    const { root, open } = await openDialog()

    await chooseBucket(root, 'kelp')
    await click(button(root, 'Create'))

    expect(createS3Credentials).toHaveBeenCalledWith(expect.objectContaining({ group_id: 'g1', encrypted_buckets: ['kelp'] }))
    const shown = content(root)
    expect(shown).toContain(TOKEN)
    expect(shown).toContain('aws_session_token')
    expect(shown).toContain(`export AWS_SESSION_TOKEN=${TOKEN}`)

    open.value = false
    await flush()
    open.value = true
    await flush()

    expect(content(root)).not.toContain(TOKEN)
    expect(content(root)).toContain('Create an S3 access key')
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(indexedDB.open).not.toHaveBeenCalled()
    for (const log of logs) expect(JSON.stringify(log.mock.calls)).not.toContain(TOKEN)
  })

  it('warns when the node answers without the asked session token', async () => {
    createS3Credentials.mockResolvedValueOnce({ access_key_id: 'AK3', access_secret: 'SECRET3' })
    const { root } = await openDialog()

    await chooseBucket(root, 'reef')
    await click(button(root, 'Create'))

    expect(content(root)).toContain('The node returned no session token')
    expect(content(root)).not.toContain('AWS_SESSION_TOKEN')
  })

  it('says why the node refused a key with encrypted buckets', async () => {
    const refusals: Array<[Api.ApiError, string]> = [
      [new Api.ApiError(409, 'locked', 'bucket_locked'), 'A chosen bucket is locked now.'],
      [new Api.ApiError(403, 'forbidden'), 'You must be a current key holder of every chosen bucket.'],
      [new Api.ApiError(400, 'plain', 'bucket_not_encrypted'), 'A chosen bucket is not encrypted'],
    ]
    for (const [refusal, message] of refusals) {
      createS3Credentials.mockRejectedValueOnce(refusal)
      const { root } = await openDialog()
      await chooseBucket(root, 'reef')
      await click(button(root, 'Create'))
      expect(content(root)).toContain(message)
    }
  })

  it('drops a chosen bucket that is no longer offered', async () => {
    const { root } = await openDialog()
    await chooseBucket(root, 'reef')

    tokenChoices.value = ['kelp']
    await flush()
    await click(button(root, 'Create'))

    expect(createS3Credentials.mock.calls[0][0]).not.toHaveProperty('encrypted_buckets')
  })
})
