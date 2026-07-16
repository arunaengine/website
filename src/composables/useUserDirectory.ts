import { reactive } from 'vue'
import { useAruna } from './useAruna'
import type { GetUserResponse } from '@/lib/api'

// Resolves `{ulid}@{realm}` user ids to profiles via GET /users/{id}, with a
// module-level cache so member lists and author chips don't refetch the same
// user. Failures cache as null (unknown/foreign-realm users stay unresolved).
const cache = reactive(new Map<string, GetUserResponse | null>())
const pending = new Map<string, Promise<GetUserResponse | null>>()

export function useUserDirectory() {
  const { getUser } = useAruna()

  function resolveUser(userId: string): Promise<GetUserResponse | null> {
    if (cache.has(userId)) return Promise.resolve(cache.get(userId) ?? null)
    const inFlight = pending.get(userId)
    if (inFlight) return inFlight
    const promise = getUser(userId)
      .then((user): GetUserResponse | null => user)
      .catch(() => null)
      .then((user) => {
        cache.set(userId, user)
        pending.delete(userId)
        return user
      })
    pending.set(userId, promise)
    return promise
  }

  function resolveUsers(userIds: string[]): Promise<Array<GetUserResponse | null>> {
    return Promise.all(userIds.map(resolveUser))
  }

  function cachedUser(userId: string): GetUserResponse | null {
    return cache.get(userId) ?? null
  }

  return { resolveUser, resolveUsers, cachedUser }
}
