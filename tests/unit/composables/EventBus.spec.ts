import {describe, expect, it, vi } from "vitest"

describe('composables/EventBus', () => {
  async function loadEventBus() {
    vi.resetModules()
    return (await import('~/composables/EventBus')).default
  }

  it('emits data to subscribed listeners', async () => {
    const eventBus = await loadEventBus()
    const handler = vi.fn()

    eventBus.on('resource-created', handler)
    eventBus.emit('resource-created', { id: 'resource-1' })

    expect(handler).toHaveBeenCalledWith({ id: 'resource-1' })
  })

  it('removes a listener with off', async () => {
    const eventBus = await loadEventBus()
    const first = vi.fn()
    const second = vi.fn()

    eventBus.on('resource-created', first)
    eventBus.on('resource-created', second)
    eventBus.off('resource-created', first)
    eventBus.emit('resource-created', 'payload')

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith('payload')
  })

  it('ignores unknown events', async () => {
    const eventBus = await loadEventBus()

    expect(() => eventBus.emit('missing-event', { ok: true })).not.toThrow()
    expect(() => eventBus.off('missing-event', vi.fn())).not.toThrow()
  })
})
