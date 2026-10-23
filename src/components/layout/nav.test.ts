import { describe, expect, it } from 'vitest'
import type { PortalFeature } from '@/lib/features'
import { navEntries, type NavItem } from './nav'

function paths(hidden: PortalFeature[] = [], desktop = false, localRuns = true): string[] {
  return navEntries({
    desktop,
    localRuns,
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

  it('shows the desktop runs only while local runs are on', () => {
    expect(paths([], true, false)).not.toContain('/app/runs')
    expect(paths([], true, true)).toContain('/app/runs')
  })

  it('lists the desktop entries in the approved order', () => {
    const labels = navEntries({ desktop: true, isRealmAdmin: false, canInspectUsers: false, localRuns: true })
      .filter((entry): entry is NavItem => !('separator' in entry))
      .map((entry) => entry.label)
    const start = labels.indexOf('Sync')
    expect(labels.slice(start, start + 5)).toEqual(['Sync', 'Activity', 'Tools', 'Runs', 'This computer'])
  })

  it('never hides admin pages', () => {
    expect(paths(['profiles', 'compute', 'notebooks', 'watches'])).toContain('/app/admin')
  })

  it('keeps every entry without switches', () => {
    expect(paths()).toEqual(expect.arrayContaining(['/app/profiles', '/app/compute', '/app/notebooks']))
  })
})
