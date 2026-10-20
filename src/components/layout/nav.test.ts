import { describe, expect, it } from 'vitest'
import type { PortalFeature } from '@/lib/features'
import { navEntries, type NavItem } from './nav'

function paths(hidden: PortalFeature[] = [], desktop = false): string[] {
  return navEntries({
    desktop,
    isRealmAdmin: true,
    canInspectUsers: false,
    shown: (feature) => !hidden.includes(feature),
  })
    .filter((entry): entry is NavItem => !('separator' in entry))
    .map((entry) => entry.to)
}

describe('navigation feature switches', () => {
  it('drops hidden features from the menu', () => {
    const visible = paths(['profiles', 'compute', 'notebooks'])

    expect(visible).not.toContain('/app/profiles')
    expect(visible).not.toContain('/app/compute')
    expect(visible).not.toContain('/app/notebooks')
    expect(visible).toContain('/app/datasets')
  })

  it('drops the desktop runs with compute', () => {
    expect(paths([], true)).toContain('/app/runs')
    const visible = paths(['compute'], true)
    expect(visible).not.toContain('/app/runs')
    expect(visible).not.toContain('/app/compute')
    expect(visible).toContain('/app/device')
  })

  it('never hides admin pages', () => {
    expect(paths(['profiles', 'compute', 'notebooks', 'watches'])).toContain('/app/admin')
  })

  it('keeps every entry without switches', () => {
    expect(paths()).toEqual(expect.arrayContaining(['/app/profiles', '/app/compute', '/app/notebooks']))
  })
})
