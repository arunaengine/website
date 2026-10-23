import { afterEach, describe, expect, it } from 'vitest'
import type { NavigationGuard } from 'vue-router'
import { applyPortalConfig } from '@/lib/config'
import { distributedMockRoutes, mockEnabled } from './distributedMock'

afterEach(() => {
  applyPortalConfig({})
})

function enter() {
  const guard = distributedMockRoutes().beforeEnter as NavigationGuard
  return guard({} as never, {} as never, (() => undefined) as never)
}

describe('distributed mock gate', () => {
  it('stays closed unless the feature is on', () => {
    expect(mockEnabled()).toBe(false)
    expect(enter()).toEqual({ name: 'buckets' })
  })

  it('opens when the deployment turns the feature on', () => {
    applyPortalConfig({ features: { distributedMock: true } })
    expect(mockEnabled()).toBe(true)
    expect(enter()).toBe(true)
  })
})
