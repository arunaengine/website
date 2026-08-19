import { effectScope, type EffectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShaclFinding } from './findings'
import { useShaclValidation } from './useShaclValidation'

type FakeWorkerEvent = 'message' | 'messageerror' | 'error'
type FakeWorkerListener = (event: { data?: unknown }) => void

class FakeWorker {
  static instances: FakeWorker[] = []
  static postError: Error | null = null

  readonly posts: unknown[] = []
  terminated = false
  private listeners = new Map<FakeWorkerEvent, FakeWorkerListener[]>()

  constructor() {
    FakeWorker.instances.push(this)
  }

  addEventListener(type: FakeWorkerEvent, listener: FakeWorkerListener) {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  postMessage(message: unknown) {
    if (FakeWorker.postError) throw FakeWorker.postError
    this.posts.push(message)
  }

  terminate() {
    this.terminated = true
  }

  emit(type: FakeWorkerEvent, data?: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener({ data })
  }
}

const INPUT = { crate: { '@graph': [] }, shapes: ['@prefix sh: <http://www.w3.org/ns/shacl#> .'], rootId: './' }
const FINDING: ShaclFinding = {
  focusId: './',
  message: 'A prior finding',
  severity: 'warning',
  sourceShape: 'https://example.test/shape',
}

let scope: EffectScope | undefined

function setupValidation() {
  scope = effectScope()
  return scope.run(() => useShaclValidation())!
}

function lastRequestId(worker: FakeWorker): number {
  return (worker.posts.at(-1) as { id: number }).id
}

beforeEach(() => {
  vi.useFakeTimers()
  FakeWorker.instances = []
  FakeWorker.postError = null
  vi.stubGlobal('Worker', FakeWorker)
})

afterEach(() => {
  scope?.stop()
  scope = undefined
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('SHACL worker request liveness', () => {
  it('times out a worker that does not respond and clears running', () => {
    const validation = setupValidation()
    validation.validateNow(INPUT)
    const hungWorker = FakeWorker.instances[0]!

    expect(validation.running.value).toBe(true)
    vi.advanceTimersByTime(19_999)
    expect(validation.running.value).toBe(true)
    vi.advanceTimersByTime(1)

    expect(validation.running.value).toBe(false)
    expect(validation.error.value).toBe('Validation timed out. Retry validation.')
    expect(validation.unavailable.value).toBe(false)
    expect(hungWorker.terminated).toBe(true)
    expect(FakeWorker.instances).toHaveLength(2)
  })

  it('fails an in-flight request on messageerror without clearing prior findings', () => {
    const validation = setupValidation()
    validation.validateNow(INPUT)
    const worker = FakeWorker.instances[0]!
    worker.emit('message', { id: lastRequestId(worker), ok: true, findings: [FINDING] })

    validation.validateNow(INPUT)
    worker.emit('messageerror')

    expect(validation.running.value).toBe(false)
    expect(validation.error.value).toContain('could not be read')
    expect(validation.findings.value).toEqual([FINDING])
    expect(worker.terminated).toBe(true)
  })

  it('does not wedge when postMessage throws synchronously', () => {
    const validation = setupValidation()
    FakeWorker.postError = new Error('DataCloneError')

    validation.validateNow(INPUT)

    expect(validation.running.value).toBe(false)
    expect(validation.error.value).toContain('DataCloneError')
    expect(validation.unavailable.value).toBe(false)

    FakeWorker.postError = null
    const worker = FakeWorker.instances[0]!
    validation.validateNow(INPUT)
    expect(validation.running.value).toBe(true)
    worker.emit('message', { id: lastRequestId(worker), ok: true, findings: [] })
    expect(validation.running.value).toBe(false)
    expect(validation.error.value).toBeNull()
  })

  it('ignores a late response from a timed-out worker', () => {
    const validation = setupValidation()
    validation.validateNow(INPUT)
    const hungWorker = FakeWorker.instances[0]!
    const staleRequestId = lastRequestId(hungWorker)
    vi.advanceTimersByTime(20_000)

    const replacement = FakeWorker.instances[1]!
    validation.validateNow(INPUT)
    hungWorker.emit('message', { id: staleRequestId, ok: true, findings: [FINDING] })

    expect(validation.running.value).toBe(true)
    expect(validation.findings.value).toEqual([])

    replacement.emit('message', { id: lastRequestId(replacement), ok: true, findings: [] })
    expect(validation.running.value).toBe(false)
    expect(validation.findings.value).toEqual([])
  })
})
