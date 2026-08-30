import { describe, expect, it } from 'vitest'
import { stateTone, stateVariant, toneVariant } from './stateBadge'
import { TES_STATE_META } from './tes'
import { JOB_STATE_META } from './jobs'

describe('state vocabulary', () => {
  it('maps every tone to one variant', () => {
    expect(toneVariant('idle')).toBe('secondary')
    expect(toneVariant('progress')).toBe('sky')
    expect(toneVariant('done')).toBe('success')
    expect(toneVariant('attention')).toBe('warn')
    expect(toneVariant('failed')).toBe('destructive')
    expect(toneVariant('count')).toBe('outline')
    expect(toneVariant('info')).toBe('accent')
  })

  it('reads a state whatever its case', () => {
    expect(stateTone('RUNNING')).toBe('progress')
    expect(stateTone('running')).toBe('progress')
    expect(stateTone('  Complete ')).toBe('done')
  })

  it('gives the same colour to the same situation', () => {
    // A task and a job that are both running must not read differently.
    expect(TES_STATE_META.RUNNING.variant).toBe(JOB_STATE_META.running.variant)
    expect(TES_STATE_META.QUEUED.variant).toBe(JOB_STATE_META.queued.variant)
    expect(TES_STATE_META.CANCELED.variant).toBe(JOB_STATE_META.cancelled.variant)
  })

  it('spells a cancellation the same way', () => {
    expect(TES_STATE_META.CANCELED.label).toBe('Cancelled')
    expect(TES_STATE_META.CANCELING.label).toBe('Cancelling')
  })

  it('gives a failed run one headline', () => {
    // The run detail names the cause; the badge only says it failed.
    expect(TES_STATE_META.EXECUTOR_ERROR.label).toBe('Failed')
    expect(TES_STATE_META.SYSTEM_ERROR.label).toBe('Failed')
    expect(TES_STATE_META.SYSTEM_ERROR.variant).toBe(JOB_STATE_META.failed.variant)
  })

  it('falls back to a neutral count', () => {
    expect(stateVariant('something the backend invented')).toBe('outline')
  })
})
