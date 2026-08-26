// Two-tier cache for remote terminology lookups plus brief negative caching of
// provider failures. The bundled provider never goes through here; it is
// already instant and offline.
//
//  - Session tier: an in-memory Map keyed `providerId|query`; hits are served
//    without revalidation for the rest of the session.
//  - Persisted tier: an LRU in localStorage (`aruna.termCache.v1`, ~200
//    entries) with a write timestamp. Reads are stale-while-revalidate: the
//    cached hits render immediately and the registry refreshes entries older
//    than the freshness window in the background.
//  - Negative tier: a provider that just failed is skipped for a short window
//    so a dead gateway is not re-probed on every keystroke.
import type { ProviderStatus, TermHit } from './types'

const STORE_KEY = 'aruna.termCache.v2'
const MAX_PERSISTED_ENTRIES = 200
// Persisted entries older than this are served stale and revalidated.
const FRESH_MS = 6 * 60 * 60 * 1000
// How long a provider failure suppresses new requests to that provider.
const FAILURE_TTL_MS = 30_000

interface PersistedEntry {
  hits: TermHit[]
  // Write time: drives staleness.
  at: number
  // Last-read time: drives LRU eviction.
  used: number
}

export interface CachedHits {
  hits: TermHit[]
  // True when the entry is past the freshness window and worth revalidating.
  stale: boolean
}

const sessionCache = new Map<string, TermHit[]>()
const recentFailures = new Map<string, { status: ProviderStatus; at: number }>()

function cacheKey(providerId: string, query: string): string {
  return `${providerId}|${query.trim().toLowerCase()}`
}

function readStore(): Record<string, PersistedEntry> {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, PersistedEntry>
  } catch {
    return {}
  }
}

function writeStore(store: Record<string, PersistedEntry>): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store))
  } catch {
    // Ignore storage failures (private mode, quota); the session tier still works.
  }
}

function validEntry(entry: unknown): entry is PersistedEntry {
  if (!entry || typeof entry !== 'object') return false
  const candidate = entry as Partial<PersistedEntry>
  return Array.isArray(candidate.hits) && typeof candidate.at === 'number'
}

export function readTermCache(providerId: string, query: string): CachedHits | null {
  const key = cacheKey(providerId, query)
  const session = sessionCache.get(key)
  if (session) return { hits: session, stale: false }

  const store = readStore()
  const entry = store[key]
  if (!validEntry(entry)) return null
  // Touch for LRU; skip the write if touching fails, purely an optimization.
  entry.used = Date.now()
  writeStore(store)
  return { hits: entry.hits, stale: Date.now() - entry.at > FRESH_MS }
}

export function writeTermCache(providerId: string, query: string, hits: TermHit[]): void {
  const key = cacheKey(providerId, query)
  sessionCache.set(key, hits)

  const store = readStore()
  const now = Date.now()
  store[key] = { hits, at: now, used: now }
  const keys = Object.keys(store)
  if (keys.length > MAX_PERSISTED_ENTRIES) {
    keys
      .sort((a, b) => (store[a].used ?? store[a].at ?? 0) - (store[b].used ?? store[b].at ?? 0))
      .slice(0, keys.length - MAX_PERSISTED_ENTRIES)
      .forEach((evicted) => delete store[evicted])
  }
  writeStore(store)
}

// Negative caching: remember that a provider just failed (and how), so the
// registry can skip it (and still report the degraded status) for a moment.
export function noteProviderFailure(providerId: string, status: ProviderStatus): void {
  recentFailures.set(providerId, { status, at: Date.now() })
}

export function recentProviderFailure(providerId: string): ProviderStatus | null {
  const failure = recentFailures.get(providerId)
  if (!failure) return null
  if (Date.now() - failure.at > FAILURE_TTL_MS) {
    recentFailures.delete(providerId)
    return null
  }
  return failure.status
}

export function clearProviderFailure(providerId: string): void {
  recentFailures.delete(providerId)
}
