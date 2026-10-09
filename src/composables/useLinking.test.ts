import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/client'
import { HandshakeError } from '@/lib/federation/handshake'
import { toBase64Url } from '@/lib/federation/descriptor'
import { linkNonce } from '@/lib/federation/secret'

const requestHandoff = vi.fn()
const createLinkConfirmation = vi.fn()

vi.mock('./useFederation', () => ({ requestHandoff: (...args: unknown[]) => requestHandoff(...args) }))
vi.mock('./aruna/session', () => ({ refresh: vi.fn(), setAuthToken: vi.fn() }))
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  createLinkConfirmation: (...args: unknown[]) => createLinkConfirmation(...args),
}))

const { authToken, sessionEpoch } = await import('./aruna/state')
const { confirmLink, linkFailure } = await import('./useLinking')

function tokenWith(sid: string) {
  return `h.${toBase64Url(new TextEncoder().encode(JSON.stringify({ sid })))}.s`
}

beforeEach(() => {
  requestHandoff.mockReset()
  createLinkConfirmation.mockReset()
})

describe('confirmLink', () => {
  it('binds the handoff nonce to the local session and keeps the secret here', async () => {
    authToken.value = tokenWith('SID-1')
    requestHandoff.mockResolvedValue({ payload: { name: 'Anna' } })
    createLinkConfirmation.mockResolvedValue({ payload: {} })
    const result = await confirmLink({ realmId: 'HOME' } as never)
    const [, nonce, link] = requestHandoff.mock.calls[0]
    const [, secret] = createLinkConfirmation.mock.calls[0]
    expect(link).toBe(true)
    expect(nonce).toBe(await linkNonce('SID-1', secret))
    expect(result.name).toBe('Anna')
  })

  it('drops a confirmation when the session changed meanwhile', async () => {
    authToken.value = tokenWith('SID-1')
    requestHandoff.mockImplementation(async () => {
      sessionEpoch.value++
      return { payload: { name: 'Anna' } }
    })
    await expect(confirmLink({ realmId: 'HOME' } as never)).rejects.toThrow('session changed')
    expect(createLinkConfirmation).not.toHaveBeenCalled()
  })

  it('needs a local session first', async () => {
    authToken.value = ''
    await expect(confirmLink({ realmId: 'HOME' } as never)).rejects.toThrow('Log in here first.')
  })
})

describe('linkFailure', () => {
  it('uses short words per failure', () => {
    expect(linkFailure(new ApiError(409, 'x', 'link_conflict'))).toBe('This login is already linked to another account here.')
    expect(linkFailure(new ApiError(403, 'x', 'link_refused'))).toContain('Log in here again')
    expect(linkFailure(new ApiError(500, 'x'))).toBe('Linking failed. Try again.')
    expect(linkFailure(new HandshakeError('closed', 'x'))).toBe('Linking cancelled.')
  })
})
