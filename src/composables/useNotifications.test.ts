import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useNotifications } from './useNotifications'

const apiRequest = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api', async (importOriginal) => ({ ...(await importOriginal<object>()), apiRequest }))
vi.mock('@/composables/useAruna', () => ({
  useAruna: () => ({ apiBaseUrl: ref('https://api.test'), authToken: ref('T'), currentUser: ref(null) }),
}))
vi.mock('@/composables/useGlobalErrors', () => ({ reportGlobalError: vi.fn() }))

function row(id: string, read: boolean) {
  return { id, kind: 'bucket_key_pending', read }
}

beforeEach(() => {
  apiRequest.mockReset()
  const notifications = useNotifications()
  notifications.items.value = [row('A', false), row('B', true), row('C', false)] as never
  notifications.unreadCount.value = 5
})

describe('markRead', () => {
  it('sends unloaded ids once each and skips ids known to be read', async () => {
    apiRequest.mockResolvedValue({})
    const notifications = useNotifications()

    await notifications.markRead(['U', 'A', 'A', 'B', 'U'])

    expect(apiRequest).toHaveBeenCalledTimes(1)
    expect(apiRequest.mock.calls[0]![0]).toBe('/system/notifications/read')
    expect(JSON.parse(apiRequest.mock.calls[0]![1].body)).toEqual({ ids: ['U', 'A'] })
    expect(notifications.items.value.map((n) => n.read)).toEqual([true, true, false])
    expect(notifications.unreadCount.value).toBe(3)
  })

  it('restores loaded flags and the badge when the request fails', async () => {
    apiRequest.mockRejectedValue(new Error('offline'))
    const notifications = useNotifications()
    const revision = notifications.dashboardRevision.value

    await notifications.markRead(['U', 'A'])

    expect(notifications.items.value.map((n) => n.read)).toEqual([false, true, false])
    expect(notifications.unreadCount.value).toBe(5)
    expect(notifications.dashboardRevision.value).toBe(revision)
  })
})
