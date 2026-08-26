// Ordered terminology-provider registry with streaming search.
//
// searchAll(query, cb) delivers the bundled provider's results immediately and
// streams each remote provider's results as they land: per-provider callbacks,
// never all-or-nothing, so a slow or dead gateway can only ever ADD hits on top
// of the bundled floor. Remote lookups go through the session/persisted cache
// (stale-while-revalidate) and short negative caching of failures; per-provider
// status is tracked so the UI can show an honest degradation hint. Free text /
// minting is a consumer concern and stays possible regardless of any status.
import {
  clearProviderFailure,
  noteProviderFailure,
  readTermCache,
  recentProviderFailure,
  writeTermCache,
} from './cache'
import { bundledProvider } from './providers/bundled'
import { ts4nfdiProvider } from './providers/ts4nfdi'
import type { ProviderStatus, TermHit, TerminologyProvider, TermKind } from './types'

export { BUNDLED_PROVIDER_ID } from './providers/bundled'

interface ProviderRegistration {
  provider: TerminologyProvider
  // Remote providers go through the cache and failure tiers.
  remote?: boolean
}

// Order is priority: earlier providers win dedupe ties, so the bundled
// vocabulary always beats a remote duplicate of the same IRI.
const registrations: ProviderRegistration[] = [
  { provider: bundledProvider },
  { provider: ts4nfdiProvider, remote: true },
]

// Last observed status per provider (survives across searches so the UI can
// show a degradation dot before the next search resolves).
const lastStatus = new Map<string, ProviderStatus>()

export function providerStatus(providerId: string): ProviderStatus | undefined {
  return lastStatus.get(providerId)
}

export interface TerminologyUpdate {
  providerId: string
  providerLabel: string
  status: ProviderStatus
  // Full (deduped, kind-filtered) hit list this provider currently contributes;
  // consumers replace, not append, per providerId.
  hits: TermHit[]
}

export interface SearchAllOptions {
  // Restrict hits to these kinds; unclassified hits ('term'/absent) always pass
  // so a loosely-typed remote hit is offered rather than hidden.
  kinds?: TermKind[]
  limit?: number
  signal?: AbortSignal
}

// IRI normalization for dedupe only (never for display or baking): http/https
// and trailing-slash variants of the same term collapse onto one key.
function normalizedIri(iri: string): string {
  return iri.replace(/^https:\/\//, 'http://').replace(/\/+$/, '')
}

function matchesKinds(hit: TermHit, kinds?: TermKind[]): boolean {
  if (!kinds?.length) return true
  if (!hit.kind || hit.kind === 'term') return true
  return kinds.includes(hit.kind)
}

function isTimeout(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'TimeoutError'
}

function isCancellation(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

// Resolves when every provider has reported (or the signal aborted). Updates
// stop the moment the signal aborts, so callers can cancel per keystroke.
export async function searchAll(
  query: string,
  onUpdate: (update: TerminologyUpdate) => void,
  opts: SearchAllOptions = {},
): Promise<void> {
  const limit = opts.limit ?? 6
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return

  // Dedupe state for this search: normalized IRI -> retained hit + owner.
  // Registry-owned clones, so annotation merges never mutate cached objects.
  const seen = new Map<string, { hit: TermHit; providerId: string }>()
  const ownedKeys = new Map<string, Set<string>>()

  const deliver = (registration: ProviderRegistration, status: ProviderStatus, hits: TermHit[]) => {
    lastStatus.set(registration.provider.id, status)
    if (opts.signal?.aborted) return
    onUpdate({ providerId: registration.provider.id, providerLabel: registration.provider.label, status, hits })
  }

  // Insert a provider's full result list, replacing its previous entries (a
  // stale-cache delivery followed by a fresh one must not dedupe against
  // itself). Duplicate IRIs keep the earlier provider's hit; the dropped hit's
  // definition/ontology merge into the retained one when missing (additive).
  const dedupe = (providerId: string, hits: TermHit[]): TermHit[] => {
    for (const key of ownedKeys.get(providerId) ?? []) seen.delete(key)
    const owned = new Set<string>()
    ownedKeys.set(providerId, owned)
    const kept: TermHit[] = []
    for (const hit of hits) {
      const key = normalizedIri(hit.iri)
      const existing = seen.get(key)
      if (existing) {
        if (!existing.hit.definition && hit.definition) existing.hit.definition = hit.definition
        if (!existing.hit.ontology && hit.ontology) existing.hit.ontology = hit.ontology
        continue
      }
      const clone = { ...hit }
      seen.set(key, { hit: clone, providerId })
      owned.add(key)
      kept.push(clone)
    }
    return kept
  }

  const relevant = registrations.filter((registration) =>
    !opts.kinds?.length || registration.provider.kinds.some((kind) => opts.kinds?.includes(kind)),
  )

  // Bundled (and any future local) providers first, awaited: their results are
  // effectively instant and define the dedupe baseline remote hits merge into.
  for (const registration of relevant.filter((entry) => !entry.remote)) {
    try {
      const hits = await registration.provider.search(trimmedQuery, { limit, signal: opts.signal })
      deliver(registration, 'ok', dedupe(registration.provider.id, hits.filter((hit) => matchesKinds(hit, opts.kinds))))
    } catch (err) {
      if (isCancellation(err)) return
      deliver(registration, 'error', [])
    }
  }

  await Promise.all(
    relevant
      .filter((entry) => entry.remote)
      .map((registration) => searchRemote(registration, trimmedQuery, { ...opts, limit }, deliver, dedupe)),
  )
}

async function searchRemote(
  registration: ProviderRegistration,
  query: string,
  opts: SearchAllOptions & { limit: number },
  deliver: (registration: ProviderRegistration, status: ProviderStatus, hits: TermHit[]) => void,
  dedupe: (providerId: string, hits: TermHit[]) => TermHit[],
): Promise<void> {
  const { provider } = registration
  const filter = (hits: TermHit[]) => hits.filter((hit) => matchesKinds(hit, opts.kinds)).slice(0, opts.limit)

  // Cache first (stale-while-revalidate): cached hits render immediately; a
  // stale entry additionally refreshes below and re-delivers when it lands.
  const cached = readTermCache(provider.id, query)
  let deliveredHits: TermHit[] = []
  if (cached) {
    deliveredHits = dedupe(provider.id, filter(cached.hits))
    deliver(registration, 'ok', deliveredHits)
    if (!cached.stale) return
  }

  // Negative cache: a provider that failed moments ago is not re-probed, but
  // its degraded status still surfaces (with any stale hits we already have).
  const recentFailure = recentProviderFailure(provider.id)
  if (recentFailure) {
    deliver(registration, recentFailure, deliveredHits)
    return
  }

  try {
    const hits = await provider.search(query, { limit: opts.limit, signal: opts.signal })
    clearProviderFailure(provider.id)
    writeTermCache(provider.id, query, hits)
    deliver(registration, 'ok', dedupe(provider.id, filter(hits)))
  } catch (err) {
    // Caller cancellations say nothing about the provider; report the rest as
    // degraded: never a hard failure, bundled results already stand.
    if (isCancellation(err)) return
    const status: ProviderStatus = isTimeout(err) ? 'timeout' : 'error'
    noteProviderFailure(provider.id, status)
    deliver(registration, status, deliveredHits)
  }
}
