import * as VueRuntime from 'vue'
import { defineComponent, h, ref, type Ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Api from '@/lib/api'
import { useTokenBuckets, type TokenBucketsState } from '@/composables/useTokenBuckets'
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
import * as VaultCrypto from '@/lib/vault/crypto'
import * as Hpke from '@/lib/vault/hpke'

const createS3Credentials = vi.fn<(input: Api.CreateS3CredentialsRequest) => Promise<Api.CreateS3CredentialsResponse>>(
  async () => ({ access_key_id: 'AK1', access_secret: 'S3CR3T' }),
)
const issueKeys = vi.fn()
const listGroupDataPaths = vi.fn()
const getBucketEncryption = vi.fn()
let loadTokenBuckets = false

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof Api>()),
  listGroupDataPaths: (...args: unknown[]) => listGroupDataPaths(...args),
  getBucketEncryption: (...args: unknown[]) => getBucketEncryption(...args),
}))

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
      useTokenBuckets: (group: Ref<string>, active: Ref<boolean>) => {
        tokenActive = active
        if (loadTokenBuckets) return useTokenBuckets(group, active)
        return { buckets: tokenChoices, state: tokenState, error: ref(null), unchecked: ref(0), partial: ref(false) }
      },
    },
    '@/composables/aruna/groups': { issueKeys },
    '@/lib/api': Api,
    '@/lib/utils': { errorMessage },
    '@/lib/vault/crypto': VaultCrypto,
    '@/lib/vault/hpke': Hpke,
  },
)

beforeEach(() => {
  loadTokenBuckets = false
  listGroupDataPaths.mockReset().mockResolvedValue({
    entries: [{ permission_path: '/realm/g/g1/data/node-a/reef/', kind: 'folder' }],
  })
  getBucketEncryption.mockReset().mockResolvedValue({
    mode: 'vault_locked', unlock: { state: 'unlocked' }, caller: { holder: true },
  })
  createS3Credentials.mockClear()
  createUserSession.mockClear()
  issueKeys.mockClear()
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

  it('keeps a selected bucket when the section collapses before submit', async () => {
    loadTokenBuckets = true
    const { root } = await openDialog()
    await chooseBucket(root, 'reef')

    await click(button(root, 'Encrypted buckets (optional)'))
    expect(tokenActive?.value).toBe(false)
    await click(button(root, 'Create'))

    expect(createS3Credentials).toHaveBeenCalledWith(expect.objectContaining({ encrypted_buckets: ['reef'] }))
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
    createS3Credentials.mockResolvedValueOnce({ access_key_id: 'AK2', access_secret: 'SECRET2' })
    const { root, open } = await openDialog()

    await chooseBucket(root, 'kelp')
    await click(button(root, 'Create'))

    // The browser makes the token key and sends only its public key.
    const sent = createS3Credentials.mock.calls[0][0]
    expect(sent).toMatchObject({ group_id: 'g1', encrypted_buckets: ['kelp'] })
    expect(sent.token_public_key).toMatch(/^[A-Za-z0-9+/]{43}=$/)
    const shown = content(root)
    const TOKEN = shown.match(/[0-9a-f]{64}/)?.[0] ?? ''
    const { publicKey } = await Hpke.importPrivateKey(Uint8Array.from(TOKEN.match(/../g) ?? [], (pair) => parseInt(pair, 16)))
    expect(VaultCrypto.toBase64(publicKey)).toBe(sent.token_public_key)
    expect(JSON.stringify(sent)).not.toContain(TOKEN)
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

  it('hands the open key requests of the token to key issuance', async () => {
    createS3Credentials.mockResolvedValueOnce({ access_key_id: 'AK3', access_secret: 'SECRET3', key_requests: ['R1'] })
    const { root } = await openDialog()

    await chooseBucket(root, 'reef')
    await click(button(root, 'Create'))

    expect(issueKeys).toHaveBeenCalledWith('g1', ['R1'])
    expect(content(root)).toContain('Some keys of the token wait for a key holder')
    expect(content(root)).toContain('AWS_SESSION_TOKEN')
  })

  it('says why the node refused a key with encrypted buckets', async () => {
    const refusals: Array<[Api.ApiError, string]> = [
      [new Api.ApiError(403, 'Group access denied'), 'Group access denied'],
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
