import { describe, expect, it } from 'vitest'
import type { PortalFeature } from '@/lib/features'
import { navEntries, navItemActive, type NavItem } from './nav'

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

  it('adds only This computer to the web list in the desktop', () => {
    const web = paths()
    const desktop = paths([], true)

    expect(desktop.filter((path) => !web.includes(path))).toEqual(['/app/device'])
    expect(desktop.indexOf('/app/device')).toBe(desktop.indexOf('/app/groups') - 1)
    for (const gone of ['/app/sync', '/app/activity', '/app/tools', '/app/runs']) expect(desktop).not.toContain(gone)
  })

  it('keeps This computer marked on a folder page', () => {
    const entry = navEntries({ desktop: true, isRealmAdmin: false, canInspectUsers: false })
      .filter((item): item is NavItem => !('separator' in item))
      .find((item) => item.to === '/app/device')!

    expect(navItemActive(entry, '/app/folders/f-1')).toBe(true)
    expect(navItemActive(entry, '/app/device')).toBe(true)
    expect(navItemActive(entry, '/app/buckets')).toBe(false)
  })

  it('never hides admin pages', () => {
    expect(paths(['profiles', 'compute', 'notebooks', 'watches'])).toContain('/app/admin')
  })

  it('keeps every entry without switches', () => {
    expect(paths()).toEqual(expect.arrayContaining(['/app/profiles', '/app/compute', '/app/notebooks']))
  })
})
