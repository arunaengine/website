import { afterEach, describe, expect, it, vi } from 'vitest'
import type { UserSession } from '@/lib/api'
import { authToken, sessionEpoch } from './aruna/state'
import { useUserSessions } from './useUserSessions'

const mocks = vi.hoisted(() => ({ listSessions: vi.fn(), revokeSession: vi.fn() }))

vi.mock('@/lib/api', async (actual) => ({
  ...(await actual<typeof import('@/lib/api')>()),
  listSessions: mocks.listSessions,
  revokeSession: mocks.revokeSession,
  createSession: vi.fn(),
  apiErrorMessage: (cause: unknown) => String(cause),
}))

const session = (session_id: string, current: boolean): UserSession => ({
  session_id,
  kind: 'portal',
  label: 'Portal',
  created_at: '2026-10-29T10:00:00Z',
  expires_at: '2099-01-01T00:00:00Z',
  revoked: false,
  current,
})

afterEach(() => {
  mocks.listSessions.mockReset()
  mocks.revokeSession.mockReset()
})

describe('useUserSessions', () => {
  it('shows a list only for the session epoch that listed it', async () => {
    authToken.value = 'first'
    mocks.listSessions.mockResolvedValueOnce({ sessions: [session('old', true), session('new', false)] })
    const { sessions, listed, load } = useUserSessions()
    await load()
    expect(listed.value).toBe(true)

    // Another token is applied: its own session must never be offered as one of the others.
    authToken.value = 'second'
    sessionEpoch.value++
    expect(listed.value).toBe(false)
    expect(sessions.value).toEqual([])
  })

  it('drops a list that answers after the session epoch changed', async () => {
    authToken.value = 'first'
    let answer: (value: unknown) => void = () => undefined
    mocks.listSessions.mockReturnValueOnce(new Promise((resolve) => { answer = resolve }))
    const { sessions, listed, loading, load } = useUserSessions()
    const pending = load()
    sessionEpoch.value++
    answer({ sessions: [session('old', true), session('new', false)] })
    await pending

    expect(listed.value).toBe(false)
    expect(sessions.value).toEqual([])
    expect(loading.value).toBe(false)
  })
})
