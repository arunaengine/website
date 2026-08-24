import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EnrollInvite } from '@/lib/desktopBridge'

const retained = vi.fn<() => Promise<EnrollInvite | null>>()
const status = vi.fn<() => Promise<{ enrolled: boolean; realm: string | null }>>()
const subscribe = vi.fn<(handler: (invite: EnrollInvite) => void) => Promise<(() => void) | null>>()

vi.mock('@/lib/desktopBridge', () => ({
  lastEnrollInvite: () => retained(),
  nodeStatus: () => status(),
}))

vi.mock('@/lib/desktopEvents', () => ({
  onEnrollInvite: (handler: (invite: EnrollInvite) => void) => subscribe(handler),
}))

const { useEnrollWatch } = await import('@/composables/useEnrollWatch')

function invite(over: Partial<EnrollInvite> = {}): EnrollInvite {
  return { seed: null, realm: 'R1', applied: true, error: null, ...over }
}

// The composable registers onUnmounted, so it must run inside a real setup.
async function mount() {
  let api!: ReturnType<typeof useEnrollWatch>
  await renderToString(
    createSSRApp({
      setup() {
        api = useEnrollWatch()
        return () => h('div')
      },
    }),
  )
  return api
}

afterEach(() => {
  vi.useRealTimers()
  retained.mockReset()
  status.mockReset()
  subscribe.mockReset()
})

describe('retained invitation', () => {
  it('shows what the shell kept before subscribing', async () => {
    // A link followed into a cold start is emitted before this window exists.
    const order: string[] = []
    retained.mockImplementation(async () => {
      order.push('retained')
      return invite()
    })
    subscribe.mockImplementation(async () => {
      order.push('subscribed')
      return () => {}
    })

    const watch = await mount()
    await watch.start()

    expect(watch.invite.value).toEqual(invite())
    expect(order).toEqual(['retained', 'subscribed'])
  })

  it('lets a live event supersede it', async () => {
    let deliver: ((next: EnrollInvite) => void) | undefined
    retained.mockResolvedValue(invite({ realm: 'R1' }))
    subscribe.mockImplementation(async (handler) => {
      deliver = handler
      return () => {}
    })

    const watch = await mount()
    await watch.start()
    deliver?.(invite({ realm: 'R2', applied: false, error: 'the code expired' }))

    expect(watch.invite.value).toMatchObject({ realm: 'R2', applied: false })
  })

  it('ignores a shell that retains none', async () => {
    // An older shell rejects the command; the live event still has to arrive.
    retained.mockRejectedValue(new Error('unknown command: enroll_invite_last'))
    subscribe.mockResolvedValue(() => {})

    const watch = await mount()
    await watch.start()

    expect(watch.invite.value).toBeNull()
    expect(subscribe).toHaveBeenCalled()
  })
})

describe('status fallback', () => {
  it('reports the node turning enrolled', async () => {
    // Without an event channel only the supervisor says an enrollment landed,
    // and only a change counts: one it already held is not news.
    vi.useFakeTimers()
    retained.mockResolvedValue(null)
    subscribe.mockResolvedValue(null)
    status.mockResolvedValueOnce({ enrolled: false, realm: null })
    status.mockResolvedValue({ enrolled: true, realm: 'R1' })

    const watch = await mount()
    await watch.start()
    expect(watch.invite.value).toBeNull()

    await vi.advanceTimersByTimeAsync(5_000)
    expect(watch.invite.value).toEqual({ seed: null, realm: 'R1', applied: true, error: null })
  })
})
