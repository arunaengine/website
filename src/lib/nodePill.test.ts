import { describe, expect, it } from 'vitest'
import { readStatus } from './desktopBridge'
import { nodePill, plainDuration } from './nodePill'

const status = (raw: Record<string, unknown>) => readStatus({ state: 'running', ready: true, ...raw })

describe('node pill', () => {
  it('says Running only once the node answers', () => {
    expect(nodePill(status({}))).toEqual({ label: 'Running', variant: 'success' })
    expect(nodePill(status({ ready: false })).label).toBe('Starting')
  })

  it('tells a pause from a stop', () => {
    expect(nodePill(status({ state: 'stopped' })).label).toBe('Stopped')
    expect(nodePill(status({ state: 'stopped' }), true).label).toBe('Paused')
  })

  it('does not guess before the shell answers', () => {
    expect(nodePill(null).label).toBe('Checking')
    expect(nodePill(status({ state: 'error' })).variant).toBe('destructive')
    expect(nodePill(status({ enrolling: true })).label).toBe('Connecting')
  })
})

describe('plain duration', () => {
  it('names the two biggest whole units', () => {
    expect(plainDuration(2 * 86400 + 4 * 3600 + 120)).toBe('2 days 4 hours')
    expect(plainDuration(3600 + 5 * 60)).toBe('1 hour 5 minutes')
    expect(plainDuration(86400 + 60)).toBe('1 day 1 minute')
    expect(plainDuration(90)).toBe('1 minute')
    expect(plainDuration(20)).toBe('less than a minute')
  })
})
