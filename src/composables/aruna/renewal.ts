import { watch } from 'vue'
import { ApiError, apiRequest, revokeSession } from '@/lib/api'
import { refresh, replaceToken } from './session'
import { apiBaseUrl, authToken, currentTokenKey, readStored } from './state'

// A token is renewed at four hours old, so it outlasts a night away; a day away signs out.
const RENEW_AGE_MS = 4 * 60 * 60_000
const RETRY_MS = 5 * 60_000
// Requests still carrying the old token finish before its session is revoked.
const RETIRE_DELAY_MS = 2 * 60_000

export interface TokenClaims {
  sub: string
  iat: number
  exp: number
  sid?: string
  session_kind?: string
  /** The login this token descends from; renewal keeps it. */
  auth_time?: number
}

/** The unverified claims of an Aruna bearer token; only the node checks its signature. */
export function tokenClaims(token: string): TokenClaims | null {
  try {
    const payload = (token.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(atob(payload)) as TokenClaims
    const valid = typeof claims.sub === 'string' && typeof claims.iat === 'number' && typeof claims.exp === 'number'
    return valid ? claims : null
  } catch {
    return null
  }
}

/** When the token is due for renewal in epoch milliseconds; null when the realm renews none. */
export function renewalDue(claims: TokenClaims): number | null {
  if (claims.session_kind === 'federated') return null
  return claims.iat * 1000 + Math.min(RENEW_AGE_MS, ((claims.exp - claims.iat) * 1000) / 2)
}

function newerToken(token: string, than: TokenClaims): boolean {
  const claims = tokenClaims(token)
  return Boolean(claims && claims.sub === than.sub && claims.iat > than.iat)
}

let timer: ReturnType<typeof setTimeout> | undefined
let running = false
// A token the realm refused to renew is not asked again.
let refused = ''

function schedule(at: number) {
  clearTimeout(timer)
  timer = setTimeout(() => void check(), Math.max(0, at - Date.now()))
}

function retire(sessionId: string | undefined, baseUrl: string, token: string) {
  if (sessionId) void revokeSession(sessionId, { baseUrl, token }).catch(() => undefined)
}

// The renewal holds a lock per stored token, so tabs sharing it renew it once.
function withLock(run: () => Promise<void>): Promise<void> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  return locks ? locks.request(`aruna.renewal:${currentTokenKey()}`, run) : run()
}

async function renew(token: string, claims: TokenClaims) {
  if (authToken.value !== token) return
  const key = currentTokenKey()
  const stored = key ? readStored(key) : ''
  if (stored && newerToken(stored, claims)) return replaceToken(stored)
  const baseUrl = apiBaseUrl.value
  const { token: next } = await apiRequest<{ token: string }>('/access/token', {}, { baseUrl, token })
  // The session ended while asking, so the new one is revoked instead of left behind.
  if (authToken.value !== token || apiBaseUrl.value !== baseUrl) return retire(tokenClaims(next)?.sid, baseUrl, next)
  replaceToken(next)
  setTimeout(() => retire(claims.sid, baseUrl, next), RETIRE_DELAY_MS)
}

function failed(token: string, error: unknown, expiry: number) {
  if (error instanceof ApiError && error.status === 401) return void refresh()
  if (error instanceof ApiError && error.status < 500 && error.status !== 429) {
    refused = token
    return schedule(expiry)
  }
  schedule(Math.min(Date.now() + RETRY_MS, expiry))
}

async function check(): Promise<void> {
  if (running) return
  clearTimeout(timer)
  const token = authToken.value
  const claims = token ? tokenClaims(token) : null
  if (!claims) return
  const expiry = claims.exp * 1000
  // An expired token turns the portal signed out instead of failing request by request.
  if (Date.now() >= expiry) return void refresh()
  const due = token === refused ? null : renewalDue(claims)
  if (due === null || Date.now() < due) return schedule(Math.min(due ?? expiry, expiry))
  running = true
  try {
    await withLock(() => renew(token, claims))
  } catch (error) {
    if (authToken.value === token) failed(token, error, expiry)
  } finally {
    running = false
    if (authToken.value !== token) void check()
  }
}

function adopt(event: StorageEvent) {
  const claims = tokenClaims(authToken.value)
  if (claims && event.newValue && event.key === currentTokenKey() && newerToken(event.newValue, claims)) {
    replaceToken(event.newValue)
  }
}

/** Renews the signed-in token before it expires, as long as the portal is open. */
export function startRenewal(): () => void {
  const stopWatch = watch(authToken, () => void check(), { immediate: true })
  // Timers stop while the computer sleeps, so a visible page checks again.
  const wake = () => void check()
  document.addEventListener('visibilitychange', wake)
  window.addEventListener('storage', adopt)
  return () => {
    stopWatch()
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', wake)
    window.removeEventListener('storage', adopt)
  }
}
