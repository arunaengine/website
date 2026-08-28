import { ApiError, apiRequest, type MetadataRoCrateResponse } from '@/lib/api'
import {
  parseProfileCrateForControls,
  resolveProfileArtifacts,
  type ParsedProfileControls,
} from '@/lib/profiles/rocrate'
import {
  assertCurrentSession,
  crateGenerations,
  crateLoads,
  cratePending,
  fullCrates,
  profileCrateLoads,
  profileCrateParses,
  refreshContext,
  sessionEpoch,
} from './state'

// Thrown when the RO-Crate graph projection is still materializing after the
// polling window. This is a transient state, not a failure.
export class CrateNotReadyError extends Error {
  constructor(public documentId: string) {
    super('The RO-Crate is still being prepared. Try again in a moment.')
    this.name = 'CrateNotReadyError'
  }
}

// Backoff while the graph projection materializes right after a create.
export const CRATE_POLL_DELAYS_MS = [1000, 2000, 3000, 3000, 3000, 3000, 3000]

export function setCratePending(documentId: string, pending: boolean) {
  cratePending.value = { ...cratePending.value, [documentId]: pending }
}

// Resolve externalized profile artifacts through the authenticated S3 path
// (presigned GetObject for portal-owned buckets, node DRS for DRS ids, a raw
// browser fetch only for genuinely external hosts). Imported lazily because
// useS3 imports useAruna at module load, so a static import here would form a
// cycle; by call time both modules are fully initialized.
export async function fetchProfileArtifact(url: string): Promise<string> {
  const { fetchUrlText } = await import('../useS3')
  return fetchUrlText(url)
}

// A 503 from the rocrate export means the graph projection is still
// materializing (expected right after create), so poll with backoff instead
// of surfacing an error, and give up with CrateNotReadyError after ~20s.
// `force` skips the cache read and replaces any shared in-flight load, so a
// caller that just invalidated the document always gets a fresh fetch.
export async function loadRoCrate(documentId: string, options: { force?: boolean } = {}): Promise<unknown> {
  if (!options.force) {
    if (fullCrates.value[documentId]) return fullCrates.value[documentId]
    const inFlight = crateLoads.get(documentId)
    if (inFlight) return inFlight
  }
  const load = fetchAndCacheCrate(documentId)
  crateLoads.set(documentId, load)
  try {
    return await load
  } finally {
    if (crateLoads.get(documentId) === load) crateLoads.delete(documentId)
  }
}

export async function loadProfileCrate(
  documentId: string,
  options: { force?: boolean } = {},
): Promise<ParsedProfileControls> {
  if (!options.force) {
    const cached = profileCrateParses.value[documentId]
    if (cached) return cached
    const inFlight = profileCrateLoads.get(documentId)
    if (inFlight) return inFlight
  }

  const generation = crateGenerations.get(documentId) ?? 0
  const load = (async () => {
    const rocrate = await loadRoCrate(documentId, options)
    const parsed = await parseProfileCrateForControls(rocrate)
    if ((crateGenerations.get(documentId) ?? 0) === generation) {
      profileCrateParses.value = { ...profileCrateParses.value, [documentId]: parsed }
    }
    return parsed
  })()
  profileCrateLoads.set(documentId, load)
  try {
    return await load
  } finally {
    if (profileCrateLoads.get(documentId) === load) profileCrateLoads.delete(documentId)
  }
}

export async function fetchAndCacheCrate(documentId: string): Promise<unknown> {
  const generation = crateGenerations.get(documentId) ?? 0
  const context = refreshContext()
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        assertCurrentSession(context.epoch)
        const response = await apiRequest<MetadataRoCrateResponse>(
          `/metadata/${documentId}/rocrate`,
          { query: { view: 'full' } },
          context.client,
        )
        assertCurrentSession(context.epoch)
        // Public profile crates reference their artifacts on S3 instead of
        // embedding text; fetch that content once here so the synchronous
        // consumers (mapProfile, the dataset dialog) keep reading `text`.
        // Crates without external artifacts pass through untouched.
        const resolved = await resolveProfileArtifacts(response.rocrate, fetchProfileArtifact)
        assertCurrentSession(context.epoch)
        // Commit only when no invalidation happened while this load was in
        // flight; the caller still gets the value it asked for, but a graph
        // superseded by a write never re-enters the shared cache.
        if ((crateGenerations.get(documentId) ?? 0) === generation) {
          fullCrates.value = { ...fullCrates.value, [documentId]: resolved }
        }
        return resolved
      } catch (err) {
        const materializing = err instanceof ApiError && err.status === 503
        if (!materializing) throw err
        if (attempt >= CRATE_POLL_DELAYS_MS.length) throw new CrateNotReadyError(documentId)
        setCratePending(documentId, true)
        await new Promise((resolve) => setTimeout(resolve, CRATE_POLL_DELAYS_MS[attempt]))
      }
    }
  } finally {
    if (context.epoch === sessionEpoch.value) setCratePending(documentId, false)
  }
}

// Uncached, unresolved crate for editing (loadRoCrate caches and resolves
// profile artifacts, which must never be written back).
export async function fetchRoCrateRaw(documentId: string): Promise<unknown> {
  const context = refreshContext()
  const response = await apiRequest<MetadataRoCrateResponse>(
    `/metadata/${encodeURIComponent(documentId)}/rocrate`,
    { query: { view: 'full' } },
    context.client,
  )
  assertCurrentSession(context.epoch)
  return response.rocrate
}

export function invalidateCrate(documentId: string) {
  // The generation bump fences loads already in flight: whatever they were
  // fetching predates this invalidation and must not be re-cached.
  crateGenerations.set(documentId, (crateGenerations.get(documentId) ?? 0) + 1)
  const { [documentId]: _removed, ...rest } = fullCrates.value
  fullCrates.value = rest
  const { [documentId]: _removedParse, ...remainingParses } = profileCrateParses.value
  profileCrateParses.value = remainingParses
}
