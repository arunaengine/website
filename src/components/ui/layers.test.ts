import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { focusEntersAssistant, insideFloatingLayer } from './layers'

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
}

function level(name: string): number {
  return Number(source('../../assets/main.css').match(new RegExp(`--z-${name}:\\s*(\\d+)`))?.[1])
}

// The suite runs without a DOM, so the event carries an element of our own.
class FakeElement {
  constructor(private readonly markers: string[]) {}

  closest(query: string): FakeElement | null {
    return this.markers.some((marker) => query.includes(marker)) ? this : null
  }
}

function interaction(target: unknown): Event {
  return { detail: { originalEvent: { target } } } as unknown as Event
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('floating layers', () => {
  it('keeps the assistant above the modal and its own dialog above both', () => {
    expect(level('modal')).toBeLessThan(level('assistant'))
    expect(level('assistant')).toBeLessThan(level('assistant-modal'))
  })

  it('raises the panel and marks it, so a modal cannot bury or dismiss it', () => {
    const panel = source('../assistant/AssistantPanel.vue')

    expect(panel).toContain('z-[var(--z-assistant)]')
    expect(panel).toContain('pointer-events-auto')
    expect(panel).toContain('data-assistant-layer')
  })
})

describe('insideFloatingLayer', () => {
  it('keeps a dialog open for a click in the assistant panel', () => {
    vi.stubGlobal('Element', FakeElement)

    expect(insideFloatingLayer(interaction(new FakeElement(['[data-assistant-layer]'])))).toBe(true)
    expect(insideFloatingLayer(interaction(new FakeElement(['[data-portal-list]'])))).toBe(true)
  })

  it('still dismisses on a click anywhere else', () => {
    vi.stubGlobal('Element', FakeElement)

    expect(insideFloatingLayer(interaction(new FakeElement([])))).toBe(false)
    expect(insideFloatingLayer(interaction(null))).toBe(false)
  })
})

function focusEvent(type: string, target: unknown, relatedTarget: unknown = null): FocusEvent {
  return { type, target, relatedTarget } as unknown as FocusEvent
}

describe('focusEntersAssistant', () => {
  it('sees focus arriving in the panel and leaving towards it', () => {
    vi.stubGlobal('Element', FakeElement)
    const panel = new FakeElement(['[data-assistant-layer]'])

    expect(focusEntersAssistant(focusEvent('focusin', panel))).toBe(true)
    expect(focusEntersAssistant(focusEvent('focusout', new FakeElement([]), panel))).toBe(true)
  })

  it('leaves every other focus move to the dialog trap', () => {
    vi.stubGlobal('Element', FakeElement)
    const elsewhere = new FakeElement([])

    expect(focusEntersAssistant(focusEvent('focusin', elsewhere))).toBe(false)
    expect(focusEntersAssistant(focusEvent('focusout', elsewhere, elsewhere))).toBe(false)
    // A window losing focus reports no related target and must stay trapped.
    expect(focusEntersAssistant(focusEvent('focusout', elsewhere))).toBe(false)
  })

  it('is installed by both shared dialog wrappers', () => {
    expect(source('./DialogContent.vue')).toContain('allowAssistantFocus()')
    expect(source('./SheetContent.vue')).toContain('allowAssistantFocus()')
  })
})
