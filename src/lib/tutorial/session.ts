// One interactive tutorial at a time. The session owns the step cursor, the
// simulated run state and the timers that advance it; the views own what they
// render for a step. Nothing here touches the network by itself.
import { computed, ref, shallowRef } from 'vue'
import type { TesState, TesTask } from '@/lib/tes'
import { setApiInterceptor, type ApiInterceptor } from './interceptor'

export type TutorialId = 'compute' | 'profile'

/** One stop: a real route, a real `data-tutorial` anchor, and how it advances. */
export interface TutorialStep {
  id: string
  route: string
  target: string
  title: string
  body: string
  /** 'action' advances when the user reaches the next step's route. */
  advanceOn: 'action' | 'next'
}

/** Timer surface, injectable so tests drive the simulated run themselves. */
export interface TutorialClock {
  schedule(ms: number, run: () => void): void
  cancelAll(): void
}

/** State the tutorial's fixtures read while the session runs. */
export interface TutorialData {
  /** Stage of the simulated run, once one was submitted. */
  runState?: TesState
  startedMs?: number
  /** The draft the user submitted, echoed back by the run detail. */
  submittedTask?: TesTask
}

interface TutorialRouter {
  currentRoute: { value: { fullPath: string } }
  push(to: string): unknown
}

export function timeoutClock(): TutorialClock {
  const pending = new Set<ReturnType<typeof setTimeout>>()
  return {
    schedule(ms, run) {
      const timer = setTimeout(() => {
        pending.delete(timer)
        run()
      }, ms)
      pending.add(timer)
    },
    cancelAll() {
      for (const timer of pending) clearTimeout(timer)
      pending.clear()
    },
  }
}

const id = ref<TutorialId | null>(null)
const steps = shallowRef<TutorialStep[]>([])
const index = ref(0)
const status = ref<'idle' | 'running' | 'done'>('idle')
const data = ref<TutorialData>({})

let router: TutorialRouter | null = null
let clock: TutorialClock = timeoutClock()
let reset: (() => void) | null = null

export const tutorialId = computed(() => id.value)
export const tutorialActive = computed(() => status.value !== 'idle')
export const tutorialStatus = computed(() => status.value)
export const tutorialStep = computed<TutorialStep | null>(() => steps.value[index.value] ?? null)
export const tutorialIndex = computed(() => index.value)
export const tutorialCount = computed(() => steps.value.length)
export const tutorialData = computed(() => data.value)

/** The app shell hands its router over once; every tutorial navigates with it. */
export function bindTutorialRouter(next: TutorialRouter | null) {
  router = next
}

export function setTutorialClock(next: TutorialClock) {
  clock.cancelAll()
  clock = next
}

export function scheduleTutorial(ms: number, run: () => void) {
  clock.schedule(ms, run)
}

export function setTutorialData(patch: TutorialData) {
  data.value = { ...data.value, ...patch }
}

export interface TutorialStart {
  id: TutorialId
  steps: TutorialStep[]
  /** Answers every API call while this session runs. */
  api: ApiInterceptor
  /** Puts the tutorial's own draft back on a restart. */
  reset?: () => void
}

export function startTutorial(start: TutorialStart) {
  if (!start.steps.length) return
  clock.cancelAll()
  reset = start.reset ?? null
  id.value = start.id
  steps.value = start.steps
  index.value = 0
  data.value = {}
  status.value = 'running'
  setApiInterceptor(start.api)
  enter()
}

export function nextTutorialStep() {
  if (index.value + 1 >= steps.value.length) {
    status.value = 'done'
    clock.cancelAll()
    return
  }
  index.value += 1
  enter()
}

export function backTutorialStep() {
  if (index.value === 0) return
  index.value -= 1
  enter()
}

/** Ends the session: no interceptor, no pending timer, no step state. */
export function exitTutorial() {
  clock.cancelAll()
  setApiInterceptor(null)
  reset = null
  status.value = 'idle'
  id.value = null
  steps.value = []
  index.value = 0
  data.value = {}
}

/** Back to step one with fresh fixtures; the session and its API stay up. */
export function restartTutorial() {
  if (!steps.value.length) return
  clock.cancelAll()
  reset?.()
  index.value = 0
  data.value = {}
  status.value = 'running'
  enter()
}

/**
 * Keeps the cursor on the surface the user drove to with the real controls: a
 * step marked 'action' is done once the next step's route is reached.
 */
export function syncTutorialRoute(fullPath: string) {
  if (status.value !== 'running') return
  const current = steps.value[index.value]
  const next = steps.value[index.value + 1]
  if (!current || !next || current.advanceOn !== 'action') return
  if (next.route === fullPath) index.value += 1
}

function enter() {
  const step = steps.value[index.value]
  if (!step || !router) return
  // fullPath, not path: a wizard step lives in the query, so comparing paths
  // alone would strand the tutorial on the step it is leaving.
  if (router.currentRoute.value.fullPath !== step.route) void router.push(step.route)
}
