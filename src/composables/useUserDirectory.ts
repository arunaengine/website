import { reactive, watch } from 'vue'
import { sessionEpoch } from './aruna/state'
import { useAruna } from './useAruna'
import type { GetUserResponse, ResolveUserResult } from '@/lib/api'

// Full lookups may contain private owner/admin fields; caches must stay within one API session.
const RESOLVE_CHUNK = 100

const fullCache = reactive(new Map<string, GetUserResponse | null>())
const liteCache = reactive(new Map<string, ResolveUserResult | null>())
const fullPending = new Map<string, Promise<GetUserResponse | null>>()
const liteInFlight = new Set<string>()
watch(sessionEpoch, () => {
  fullCache.clear()
  liteCache.clear()
  fullPending.clear()
  liteInFlight.clear()
}, { flush: 'sync' })

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export function useUserDirectory() {
  const { getUser, resolveUsers: resolveUsersApi } = useAruna()

  function resolveUser(userId: string, opts?: { force?: boolean }): Promise<GetUserResponse | null> {
    if (opts?.force) fullCache.delete(userId)
    if (fullCache.has(userId)) return Promise.resolve(fullCache.get(userId) ?? null)
    const inFlight = fullPending.get(userId)
    if (inFlight) return inFlight
    const epoch = sessionEpoch.value
    const promise = getUser(userId)
      .then((user): GetUserResponse | null => user)
      .catch(() => null)
      .then((user) => {
        if (epoch !== sessionEpoch.value) return null
        fullCache.set(userId, user)
        fullPending.delete(userId)
        return user
      })
    fullPending.set(userId, promise)
    return promise
  }

  async function resolveUsers(userIds: string[]): Promise<Array<ResolveUserResult | null>> {
    const epoch = sessionEpoch.value
    const unique = [...new Set(userIds)]
    const missing = unique.filter(
      (id) => !fullCache.has(id) && !liteCache.has(id) && !liteInFlight.has(id),
    )
    for (const batch of chunk(missing, RESOLVE_CHUNK)) {
      for (const id of batch) liteInFlight.add(id)
      try {
        const resolved = await resolveUsersApi(batch)
        if (epoch !== sessionEpoch.value) return []
        const byId = new Map(resolved.map((user) => [user.user_id, user]))
        for (const id of batch) liteCache.set(id, byId.get(id) ?? null)
      } catch {
        if (epoch !== sessionEpoch.value) return []
        for (const id of batch) if (!liteCache.has(id)) liteCache.set(id, null)
      } finally {
        if (epoch === sessionEpoch.value) for (const id of batch) liteInFlight.delete(id)
      }
    }
    return unique.map((id) => cachedUser(id))
  }

  function cachedUser(userId: string): ResolveUserResult | null {
    return fullCache.get(userId) ?? liteCache.get(userId) ?? null
  }

  return { resolveUser, resolveUsers, cachedUser }
}
