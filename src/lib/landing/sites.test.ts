import { describe, expect, it } from 'vitest'
import { SITES, project } from './sites'

describe('landing sites', () => {
  it('places every pinned site on the 600 by 310 world map', () => {
    const pinned = SITES.filter((site) => site.at)

    expect(pinned.map((site) => site.place)).toEqual(['Boston', 'Heidelberg', 'Mumbai', 'San Diego', 'Tokyo'])
    for (const site of pinned) {
      const [x, y] = project(...site.at!)
      expect(x, site.place).toBeGreaterThan(0)
      expect(x, site.place).toBeLessThan(600)
      expect(y, site.place).toBeGreaterThan(0)
      expect(y, site.place).toBeLessThan(310)
    }
    // Heidelberg lies east of Boston and north of Mumbai.
    expect(project(8.67, 49.4)[0]).toBeGreaterThan(project(-71.06, 42.36)[0])
    expect(project(8.67, 49.4)[1]).toBeLessThan(project(72.88, 19.08)[1])
  })
})
