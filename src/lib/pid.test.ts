import { describe, expect, it } from 'vitest'
import { pidResolution } from './pid'

describe('pidResolution', () => {
  it('reads the manual-redirect answer as active', () => {
    expect(pidResolution('opaqueredirect', 0)).toBe('active')
    expect(pidResolution('basic', 302)).toBe('active')
  })

  it('reads 410 as withdrawn', () => {
    expect(pidResolution('basic', 410)).toBe('withdrawn')
  })

  it('reads 404 as missing', () => {
    expect(pidResolution('basic', 404)).toBe('missing')
  })

  it('never turns an outage into missing', () => {
    // pid.rs: an unreachable authority is 503, not 404 — a live PID must not
    // render as unminted.
    expect(pidResolution('basic', 503)).toBe('unavailable')
    expect(pidResolution('basic', 500)).toBe('unavailable')
  })
})
