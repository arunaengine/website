import { afterEach, describe, expect, it } from 'vitest'
import { applyPortalConfig } from '@/lib/config'
import { featureShown, type FeatureContext } from './features'

function context(overrides: Partial<FeatureContext> = {}): FeatureContext {
  return { attributes: {}, isRealmAdmin: false, defaults: {}, ...overrides }
}

afterEach(() => {
  applyPortalConfig({})
})

describe('portal feature resolution', () => {
  it('follows the user choice over the realm default and admin status', () => {
    const hidden = { 'ui.feature.profiles': 'off' }
    expect(featureShown('profiles', context({ attributes: hidden, isRealmAdmin: true }))).toBe(false)
    const visible = { 'ui.feature.profiles': 'on' }
    expect(featureShown('profiles', context({ attributes: visible, defaults: { profiles: false } }))).toBe(true)
  })

  it('shows every feature to realm admins without their own choice', () => {
    expect(featureShown('watches', context({ isRealmAdmin: true, defaults: { watches: false } }))).toBe(true)
  })

  it('applies the realm default to members', () => {
    expect(featureShown('watches', context({ defaults: { watches: false } }))).toBe(false)
    expect(featureShown('watches', context({ defaults: { watches: true } }))).toBe(true)
  })

  it('treats a missing default or an unknown value as on', () => {
    expect(featureShown('connectors', context())).toBe(true)
    expect(featureShown('connectors', context({ attributes: { 'ui.feature.connectors': 'maybe' } }))).toBe(true)
  })

  it('hides a feature the deployment turned off, whatever the user chose', () => {
    applyPortalConfig({ features: { tes: false, jobs: false } })
    const on = { 'ui.feature.compute': 'on', 'ui.feature.notebooks': 'on' }
    expect(featureShown('compute', context({ attributes: on, isRealmAdmin: true }))).toBe(false)
    expect(featureShown('notebooks', context({ attributes: on }))).toBe(false)
  })

  it('keeps compute while one compute flag is on', () => {
    applyPortalConfig({ features: { tes: false } })
    expect(featureShown('compute', context())).toBe(true)
    expect(featureShown('notebooks', context())).toBe(false)
  })
})
