import { describe, expect, it } from 'vitest'
import { adminTabs } from './adminTabs'

describe('realm administration tabs', () => {
  it('names the two placement machines apart', () => {
    const tabs = adminTabs({ placement: true, policies: true })

    expect(tabs.map((tab) => tab.id)).toEqual([
      'realm',
      'compute',
      'placement',
      'data-placement',
      'policies',
    ])
    expect(tabs.map((tab) => tab.label)).toContain('Record placement')
    expect(tabs.map((tab) => tab.label)).toContain('Data placement')
    expect(tabs.map((tab) => tab.label)).not.toContain('Placement')
    expect(tabs.map((tab) => tab.id)).not.toContain('residency')
  })

  it('drops both placement tabs when the feature is off', () => {
    const tabs = adminTabs({ placement: false, policies: false })

    expect(tabs.map((tab) => tab.id)).toEqual(['realm', 'compute'])
  })
})
