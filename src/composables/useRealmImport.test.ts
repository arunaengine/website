import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { ApiError } from '@/lib/api/client'
import { HandshakeError } from '@/lib/federation/handshake'

const api = {
  createImportIntent: vi.fn(),
  getRealmDescriptor: vi.fn(),
  createImport: vi.fn(),
  uploadTransfer: vi.fn(),
}
const archive = { submitImport: vi.fn() }
const checkOwnerNode = vi.fn()
const ask = vi.fn()
const close = vi.fn()
const navigate = vi.fn()
const openPopup = vi.fn()
const recheckRealm = vi.fn()
const secretMade = vi.fn()

vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  createImportIntent: (...args: unknown[]) => api.createImportIntent(...args),
  getRealmDescriptor: (...args: unknown[]) => api.getRealmDescriptor(...args),
  createImport: (...args: unknown[]) => api.createImport(...args),
  uploadTransfer: (...args: unknown[]) => api.uploadTransfer(...args),
}))
vi.mock('@/lib/rocrateArchive', () => ({
  submitImport: (...args: unknown[]) => archive.submitImport(...args),
}))
vi.mock('@/lib/federation/transfer', async (original) => ({
  ...(await original<typeof import('@/lib/federation/transfer')>()),
  checkOwnerNode: (...args: unknown[]) => checkOwnerNode(...args),
}))
vi.mock('@/lib/federation/popup', async (original) => ({
  ...(await original<typeof import('@/lib/federation/popup')>()),
  openPopup: () => openPopup(),
}))
vi.mock('@/lib/federation/secret', async (original) => {
  const actual = await original<typeof import('@/lib/federation/secret')>()
  return { ...actual, newSecret: async () => (secretMade(), actual.newSecret()) }
})
vi.mock('@/lib/federation/realms', async (original) => ({
  ...(await original<typeof import('@/lib/federation/realms')>()),
  recheckRealm: (...args: unknown[]) => recheckRealm(...args),
}))

const { apiBaseUrl, authToken, sessionEpoch } = await import('./aruna/state')
const { OwnerNodeError } = await import('@/lib/federation/transfer')
const { useRealmImport } = await import('./useRealmImport')

const form = {
  home: { realmId: 'A', name: 'Giessen Data', portalUrl: 'https://a.example/', portalOrigin: 'https://a.example' },
  groupId: 'G',
  groupName: 'Field notes',
  bucket: 'imports',
  prefix: 'giessen',
  metadataPath: 'datasets/river',
} as never
const descriptor = { payload: { api_url: 'https://b.example/api/v1' } }
const destination = { group_id: 'G', bucket: 'imports', prefix: 'giessen/river', metadata_path: 'datasets/river' }
const grant = {
  payload: {
    source: Array.from({ length: 32 }, (_, index) => index),
    document_id: '01JJ0B0123456789ABCDEFGHJK',
    dataset_digest: 'aa'.repeat(32),
    selection_digest: 'bb'.repeat(32),
  },
}
// core::transfer::import_key for this grant and destination, computed by the Rust code.
const KEY = 'federation-04a2c404ebc44733d4c5b288e20659a1a76f2d7c6ab914422cecef8132c83a09'
const pullUnreachable = new ApiError(502, 'unreachable', 'pull_unreachable')
const unreachable = new HandshakeError('refused', 'This realm cannot reach the other realm.', 'push_unreachable')

function script(answers: Record<string, unknown>) {
  ask.mockImplementation(async (body: { kind: string }) => {
    const answer = answers[body.kind]
    if (answer instanceof Error) throw answer
    return answer
  })
}

beforeEach(() => {
  vi.stubGlobal('window', {})
  for (const mock of [...Object.values(api), ...Object.values(archive), checkOwnerNode, ask, close, navigate, openPopup, recheckRealm, secretMade]) {
    mock.mockReset()
  }
  openPopup.mockImplementation(() => ({ ask, close, navigate }))
  recheckRealm.mockImplementation(async (realm: unknown) => realm)
  apiBaseUrl.value = 'https://b.example/api/v1'
  authToken.value = 'B-TOKEN'
  api.createImportIntent.mockResolvedValue({ payload: { intent_id: 'I', destination } })
  api.getRealmDescriptor.mockResolvedValue(descriptor)
  archive.submitImport.mockResolvedValue({ job_id: 'J2' })
})

describe('useRealmImport', () => {
  it('opens the window at the click and sends it nowhere when the source realm fails its check', async () => {
    recheckRealm.mockRejectedValue(new Error('Cannot reach Giessen Data.'))
    const flow = useRealmImport()
    const done = flow.start(form)
    expect(openPopup).toHaveBeenCalledOnce()
    await done
    expect(flow.phase.value).toBe('failed')
    expect(flow.failure.value).toBe('Cannot reach Giessen Data.')
    expect(navigate).not.toHaveBeenCalled()
    expect(ask).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalled()
  })

  it('pulls from the source with the grant and the kept secret', async () => {
    script({ export: { grant, files: 1 } })
    api.createImport.mockResolvedValue({ job_id: 'J1' })
    const flow = useRealmImport()
    await flow.start(form)
    expect(flow.phase.value).toBe('started')
    expect(flow.submitted.value).toEqual({ job_id: 'J1' })
    const [request] = api.createImport.mock.calls[0]
    expect(request.secret).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(ask.mock.calls)).not.toContain(request.secret)
    expect(close).toHaveBeenCalled()
  })

  it('lets the source push when the pull is unreachable, then imports on the checked node', async () => {
    script({ export: { grant, files: 1 }, push: { upload_id: 'U', owner_node_url: 'https://b2.example/api/v1' } })
    api.createImport.mockRejectedValue(pullUnreachable)
    checkOwnerNode.mockResolvedValue('https://b2.example/api/v1')
    const flow = useRealmImport()
    await flow.start(form)
    expect(checkOwnerNode).toHaveBeenCalledWith('https://b2.example/api/v1', 'https://b.example/api/v1', 'B-TOKEN')
    const [request, client] = archive.submitImport.mock.calls[0]
    expect(request.source).toEqual({ kind: 'upload', upload_id: 'U' })
    expect(request.idempotency_key).toBe(KEY)
    expect(client).toEqual({ baseUrl: 'https://b2.example/api/v1', token: 'B-TOKEN' })
    expect(flow.jobClient.value).toEqual(client)
  })

  it('stops before any bearer goes to a node the source made up', async () => {
    script({ export: { grant, files: 1 }, push: { upload_id: 'U', owner_node_url: 'https://evil.example' } })
    api.createImport.mockRejectedValue(pullUnreachable)
    checkOwnerNode.mockRejectedValue(new OwnerNodeError('The other realm named a node that is not part of this realm.'))
    const flow = useRealmImport()
    await flow.start(form)
    expect(flow.phase.value).toBe('failed')
    expect(flow.failure.value).toContain('not part of this realm')
    expect(archive.submitImport).not.toHaveBeenCalled()
  })

  it('takes metadata only through the window when neither server reaches the other', async () => {
    const artifact = new ArrayBuffer(4)
    script({ export: { grant, files: 0 }, push: unreachable, artifact })
    api.createImport.mockRejectedValue(pullUnreachable)
    api.uploadTransfer.mockResolvedValue({ upload_id: 'U3' })
    const flow = useRealmImport()
    await flow.start(form)
    // Stored with the intent and grant, so the node binds it to this import.
    expect(api.uploadTransfer).toHaveBeenCalledWith(
      artifact,
      { intent: { payload: { intent_id: 'I', destination } }, grant },
      { baseUrl: 'https://b.example/api/v1', token: 'B-TOKEN' },
    )
    expect(archive.submitImport.mock.calls[0][0]).toMatchObject({ source: { kind: 'upload', upload_id: 'U3' }, idempotency_key: KEY })
    expect(flow.phase.value).toBe('started')
  })

  it('does not fall back when the source refused the copy', async () => {
    const refused = new HandshakeError('refused', 'The other realm refused the copy.', 'push_refused')
    script({ export: { grant, files: 0 }, push: refused, artifact: new ArrayBuffer(4) })
    api.createImport.mockRejectedValue(pullUnreachable)
    const flow = useRealmImport()
    await flow.start(form)
    expect(flow.phase.value).toBe('failed')
    expect(flow.failure.value).toBe('The other realm refused the copy.')
    expect(ask.mock.calls.map(([body]) => body.kind)).toEqual(['export', 'push'])
    expect(api.uploadTransfer).not.toHaveBeenCalled()
  })

  it('fails clearly for files and keeps the window for a retry', async () => {
    script({ export: { grant, files: 2 }, push: unreachable })
    api.createImport.mockRejectedValue(pullUnreachable)
    const flow = useRealmImport()
    await flow.start(form)
    expect(flow.failure.value).toBe('The realms cannot copy files to each other.')
    expect(flow.canRetry.value).toBe(true)
    expect(close).not.toHaveBeenCalled()
    api.createImport.mockResolvedValue({ job_id: 'J9' })
    await flow.retry()
    expect(flow.submitted.value).toEqual({ job_id: 'J9' })
  })

  it('asks for nothing when the login changed while preparing', async () => {
    secretMade.mockImplementation(() => sessionEpoch.value++)
    const flow = useRealmImport()
    await flow.start(form)
    expect(api.createImportIntent).not.toHaveBeenCalled()
    expect(ask).not.toHaveBeenCalled()
  })

  it('drops the answer when the session changed while the window was open', async () => {
    ask.mockImplementation(async () => {
      sessionEpoch.value++
      return { grant, files: 0 }
    })
    const flow = useRealmImport()
    await flow.start(form)
    await nextTick()
    expect(api.createImport).not.toHaveBeenCalled()
    expect(flow.phase.value).toBe('idle')
    expect(close).toHaveBeenCalled()
  })

  it('retries only with the login the import started with', async () => {
    script({ export: { grant, files: 2 }, push: unreachable })
    api.createImport.mockRejectedValue(pullUnreachable)
    const flow = useRealmImport()
    await flow.start(form)
    expect(flow.canRetry.value).toBe(true)
    authToken.value = 'OTHER-TOKEN'
    sessionEpoch.value++
    await nextTick()
    await flow.retry()
    expect(api.createImport).toHaveBeenCalledOnce()
    expect(flow.phase.value).toBe('idle')
    expect(flow.canRetry.value).toBe(false)
  })

  it('forgets the started job when the login changes', async () => {
    script({ export: { grant, files: 1 } })
    api.createImport.mockResolvedValue({ job_id: 'J1' })
    const flow = useRealmImport()
    await flow.start(form)
    expect(flow.jobClient.value).toEqual({ baseUrl: 'https://b.example/api/v1', token: 'B-TOKEN' })
    sessionEpoch.value++
    await nextTick()
    expect(flow.submitted.value).toBeNull()
    expect(flow.jobClient.value).toBeNull()
  })

  it('names a destination this user cannot write', async () => {
    api.createImportIntent.mockRejectedValue(new ApiError(403, 'denied', 'import_denied'))
    const flow = useRealmImport()
    await flow.start(form)
    expect(flow.failure.value).toBe('You cannot import into Field notes.')
  })
})
