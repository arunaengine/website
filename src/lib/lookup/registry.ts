import {
  clearProviderFailure,
  noteProviderFailure,
  readTermCache,
  recentProviderFailure,
  writeTermCache,
} from '@/lib/terminology/cache'
import { orcidProvider } from './orcid'
import { rorProvider } from './ror'
import { LookupResponseError } from './types'
import type {
  LookupHit,
  LookupKind,
  LookupProvider,
  LookupProviderStatus,
  LookupUpdate,
} from './types'

const providers: LookupProvider[] = [orcidProvider, rorProvider]
const statuses = new Map<string, LookupProviderStatus>()
const activeControllers = new Map<LookupKind, AbortController>()

export interface LookupRegistryOptions {
  limit?: number
  signal?: AbortSignal
}

export function lookupProviderStatus(providerId: string): LookupProviderStatus | undefined {
  return statuses.get(providerId)
}

export function cancelLookup(kind: LookupKind): void {
  activeControllers.get(kind)?.abort()
  activeControllers.delete(kind)
}

function failureStatus(error: unknown): LookupProviderStatus {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline'
  if (error instanceof TypeError) return 'offline'
  return error instanceof LookupResponseError ? 'error' : 'error'
}

export async function searchLookups(
  kind: LookupKind,
  query: string,
  onUpdate: (update: LookupUpdate) => void,
  options: LookupRegistryOptions = {},
): Promise<void> {
  cancelLookup(kind)
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return

  const controller = new AbortController()
  activeControllers.set(kind, controller)
  const abortFromCaller = () => controller.abort(options.signal?.reason)
  if (options.signal?.aborted) abortFromCaller()
  else options.signal?.addEventListener('abort', abortFromCaller, { once: true })
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 10)

  const deliver = (
    provider: LookupProvider,
    status: LookupProviderStatus,
    hits: LookupHit[],
  ) => {
    statuses.set(provider.id, status)
    if (!controller.signal.aborted) {
      onUpdate({ providerId: provider.id, providerLabel: provider.label, status, hits: hits.slice(0, limit) })
    }
  }

  try {
    await Promise.all(providers.filter((provider) => provider.kind === kind).map(async (provider) => {
      const cacheId = `lookup:${provider.id}`
      const cached = readTermCache<LookupHit>(cacheId, trimmedQuery)
      let currentHits: LookupHit[] = []
      if (cached) {
        currentHits = cached.hits.slice(0, limit)
        deliver(provider, 'ok', currentHits)
        if (!cached.stale) return
      }

      const recentFailure = recentProviderFailure<LookupProviderStatus>(cacheId)
      if (recentFailure) {
        deliver(provider, recentFailure === 'ok' ? 'error' : recentFailure, currentHits)
        return
      }

      try {
        const hits = await provider.search(trimmedQuery, { limit, signal: controller.signal })
        if (controller.signal.aborted) return
        clearProviderFailure(cacheId)
        writeTermCache(cacheId, trimmedQuery, hits)
        deliver(provider, 'ok', hits)
      } catch (error) {
        if (controller.signal.aborted) return
        const status = failureStatus(error)
        noteProviderFailure(cacheId, status)
        deliver(provider, status, currentHits)
      }
    }))
  } finally {
    options.signal?.removeEventListener('abort', abortFromCaller)
    if (activeControllers.get(kind) === controller) activeControllers.delete(kind)
  }
}
