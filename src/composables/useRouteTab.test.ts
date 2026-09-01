import { defineComponent, h, type WritableComputedRef } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { describe, expect, it } from 'vitest'
import { flush, mountApp } from '@/test/clientRender'
import { useRouteTab } from './useRouteTab'

const ALLOWED = ['node', 'local', 'danger'] as const

/** Mounts a view that binds one route tab and hands the binding back. */
async function mounted(initial: string, key?: string): Promise<{ router: Router; tab: WritableComputedRef<string> }> {
  let tab!: WritableComputedRef<string>
  const View = defineComponent({
    setup() {
      tab = useRouteTab(ALLOWED, 'node', key)
      return () => h('span', tab.value)
    },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: View }],
  })
  await router.push(initial)
  await router.isReady()
  await mountApp(View, { router })
  return { router, tab }
}

// The setter fires a router.replace it cannot await, so the test drains
// microtasks until the navigation lands rather than waiting on a clock.
async function navigated(router: Router, expected: string | undefined, key = 'tab') {
  for (let round = 0; round < 20; round += 1) {
    if (router.currentRoute.value.query[key] === expected) return
    await flush()
  }
}

describe('route tab', () => {
  it('reads the tab out of the url', async () => {
    expect((await mounted('/?tab=danger')).tab.value).toBe('danger')
  })

  it('falls back when the value is absent or unknown', async () => {
    expect((await mounted('/')).tab.value).toBe('node')
    expect((await mounted('/?tab=nonsense')).tab.value).toBe('node')
  })

  it('writes the tab back into the url', async () => {
    const { router, tab } = await mounted('/')
    tab.value = 'local'
    await navigated(router, 'local')
    expect(router.currentRoute.value.query.tab).toBe('local')
    expect(tab.value).toBe('local')
  })

  it('drops the query on the fallback and keeps the other keys', async () => {
    const { router, tab } = await mounted('/?tab=danger&focus=search')
    tab.value = 'node'
    await navigated(router, undefined)
    expect(router.currentRoute.value.query.tab).toBeUndefined()
    expect(router.currentRoute.value.query.focus).toBe('search')
  })

  it('ignores a value outside the allowed list', async () => {
    const { router, tab } = await mounted('/?tab=local')
    tab.value = 'nonsense'
    await navigated(router, 'nonsense')
    expect(router.currentRoute.value.query.tab).toBe('local')
  })

  it('reads and writes the key it was given', async () => {
    // A tabbed component inside a tabbed page takes its own key, so neither
    // binding reads or overwrites the other's value.
    const { router, tab } = await mounted('/?tab=danger&inner=local', 'inner')
    expect(tab.value).toBe('local')

    tab.value = 'danger'
    await navigated(router, 'danger', 'inner')
    expect(router.currentRoute.value.query.inner).toBe('danger')
    expect(router.currentRoute.value.query.tab).toBe('danger')

    tab.value = 'node'
    await navigated(router, undefined, 'inner')
    expect(router.currentRoute.value.query.inner).toBeUndefined()
    expect(router.currentRoute.value.query.tab).toBe('danger')
  })
})
