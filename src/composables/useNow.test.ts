import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { content, mountApp } from '@/test/clientRender'
import { useNow } from './useNow'

const Reader = defineComponent({
  setup() {
    const now = useNow(1_000)
    return () => h('span', String(now.value))
  },
})

describe('useNow', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('ticks while a reader is mounted and stops after', async () => {
    const mounted = await mountApp(Reader)
    const first = Number(content(mounted.root))
    await vi.advanceTimersByTimeAsync(2_500)
    expect(Number(content(mounted.root))).toBeGreaterThan(first)
    mounted.app.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
