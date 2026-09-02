// Guided in-app tours for the versioned Docs. A tour walks real portal routes
// and spotlights real controls by their `data-tour` anchor; nothing is faked.
import { computed, ref, shallowRef } from 'vue'
import type { Router } from 'vue-router'

export interface TourStep {
  route: string
  anchor: string
  title: string
  body: string
}

export interface TourRect {
  top: number
  left: number
  width: number
  height: number
}

const POLL_MS = 150
const POLL_LIMIT_MS = 4000

const steps = shallowRef<TourStep[]>([])
const index = ref(0)
const active = ref(false)
const rect = ref<TourRect | null>(null)

let router: Router | null = null
let anchorEl: HTMLElement | null = null
let poll: ReturnType<typeof setInterval> | null = null
let pollToken = 0
let listening = false

export const tourActive = computed(() => active.value)
export const currentStep = computed<TourStep | null>(() => steps.value[index.value] ?? null)
export const tourIndex = computed(() => index.value)
export const tourCount = computed(() => steps.value.length)
export const tourRect = computed(() => rect.value)

/** The app shell hands its router over once; every tour navigates with it. */
export function bindTourRouter(next: Router) {
  router = next
}

export function startTour(next: TourStep[]) {
  if (!next.length) return
  steps.value = next
  index.value = 0
  active.value = true
  listen()
  void enter()
}

export function stopTour() {
  active.value = false
  steps.value = []
  index.value = 0
  rect.value = null
  anchorEl = null
  clearPoll()
  unlisten()
}

export function nextStep() {
  if (index.value + 1 >= steps.value.length) return stopTour()
  index.value += 1
  void enter()
}

export function prevStep() {
  if (index.value === 0) return
  index.value -= 1
  void enter()
}

async function enter() {
  const step = currentStep.value
  if (!step) return
  rect.value = null
  anchorEl = null
  clearPoll()
  // fullPath, not path: a step route carrying a query (?step=1) is a different
  // stop, and comparing paths alone would skip it on the way back.
  if (router && router.currentRoute.value.fullPath !== step.route) {
    await router.push(step.route).catch(() => undefined)
  }
  locate(step.anchor)
}

// A route can mount its anchor a few frames late, and the collapsed sidebar
// keeps a hidden copy of every nav anchor, so only a laid-out match counts.
function locate(anchor: string) {
  if (typeof document === 'undefined') return
  const token = (pollToken += 1)
  const deadline = Date.now() + POLL_LIMIT_MS
  const tick = () => {
    if (token !== pollToken || !active.value) return clearPoll()
    const found = visibleAnchor(anchor)
    if (found) {
      clearPoll()
      anchorEl = found
      found.scrollIntoView({ block: 'center', behavior: 'smooth' })
      measure()
    } else if (Date.now() > deadline) {
      clearPoll()
    }
  }
  tick()
  if (!anchorEl) poll = setInterval(tick, POLL_MS)
}

function visibleAnchor(anchor: string): HTMLElement | null {
  const matches = document.querySelectorAll<HTMLElement>(`[data-tour="${anchor}"]`)
  for (const element of matches) {
    const box = element.getBoundingClientRect()
    if (box.width > 0 && box.height > 0) return element
  }
  return null
}

function measure() {
  if (!anchorEl) return
  const box = anchorEl.getBoundingClientRect()
  rect.value = { top: box.top, left: box.left, width: box.width, height: box.height }
}

function clearPoll() {
  if (poll === null) return
  clearInterval(poll)
  poll = null
}

function listen() {
  if (listening || typeof window === 'undefined') return
  window.addEventListener('resize', measure)
  window.addEventListener('scroll', measure, true)
  listening = true
}

function unlisten() {
  if (!listening) return
  window.removeEventListener('resize', measure)
  window.removeEventListener('scroll', measure, true)
  listening = false
}
