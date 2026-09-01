import { reactive } from 'vue'
import { useAruna } from './useAruna'
import type { GetUserResponse, ResolveUserResult } from '@/lib/api'

// Resolves `{ulid}@{realm}` user ids to display names, with module-level caches
// so member lists and author chips share results. Batch lookups use POST
// /access/users/resolve (chunked, safe attributes only); profile pages that need the
// full record (subject_ids included) still use single GET /users/{id}.
// Failures cache as null so unknown or foreign-realm ids stay unresolved.
const RESOLVE_CHUNK = 100

const fullCache = reactive(new Map<string, GetUserResponse | null>())
const liteCache = reactive(new Map<string, ResolveUserResult | null>())
const fullPending = new Map<string, Promise<GetUserResponse | null>>()
const liteInFlight = new Set<string>()

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
    const promise = getUser(userId)
      .then((user): GetUserResponse | null => user)
      .catch(() => null)
      .then((user) => {
        fullCache.set(userId, user)
        fullPending.delete(userId)
        return user
      })
    fullPending.set(userId, promise)
    return promise
  }

  async function resolveUsers(userIds: string[]): Promise<Array<ResolveUserResult | null>> {
    const unique = [...new Set(userIds)]
    const missing = unique.filter(
      (id) => !fullCache.has(id) && !liteCache.has(id) && !liteInFlight.has(id),
    )
    for (const batch of chunk(missing, RESOLVE_CHUNK)) {
      for (const id of batch) liteInFlight.add(id)
      try {
        const resolved = await resolveUsersApi(batch)
        const byId = new Map(resolved.map((user) => [user.user_id, user]))
        for (const id of batch) liteCache.set(id, byId.get(id) ?? null)
      } catch {
        for (const id of batch) if (!liteCache.has(id)) liteCache.set(id, null)
      } finally {
        for (const id of batch) liteInFlight.delete(id)
      }
    }
    return unique.map((id) => cachedUser(id))
  }

  function cachedUser(userId: string): ResolveUserResult | null {
    return fullCache.get(userId) ?? liteCache.get(userId) ?? null
  }

  return { resolveUser, resolveUsers, cachedUser }
}
