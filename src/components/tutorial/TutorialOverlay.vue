<script setup lang="ts">
// The tutorial's own layer. Unlike the narrated tour it never swallows a
// click: the dimming panels are inert, so the reader keeps operating the real
// form while the card explains the step it is on.
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import { RotateCcw, X } from '@lucide/vue'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  backTutorialStep,
  exitTutorial,
  nextTutorialStep,
  restartTutorial,
  tutorialCount,
  tutorialIndex,
  tutorialStep,
} from '@/lib/tutorial/session'

const PAD = 8
const GAP = 12
const CARD_WIDTH = 340
const CARD_HEIGHT = 210
const MARGIN = 16
const POLL_MS = 150
const POLL_LIMIT_MS = 4000

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

const rect = ref<Rect | null>(null)
let anchor: HTMLElement | null = null
let poll: ReturnType<typeof setInterval> | null = null
let pollToken = 0

const spot = computed(() => {
  const box = rect.value
  if (!box) return null
  return { top: box.top - PAD, left: box.left - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 }
})

const spotStyle = computed(() =>
  spot.value
    ? {
        top: `${spot.value.top}px`,
        left: `${spot.value.left}px`,
        width: `${spot.value.width}px`,
        height: `${spot.value.height}px`,
      }
    : {},
)

// Four inert panels around the cutout: the dimming is drawn, never clicked.
const panels = computed(() => {
  const box = spot.value
  if (!box || typeof window === 'undefined') return []
  const right = box.left + box.width
  const bottom = box.top + box.height
  return [
    { top: 0, left: 0, width: window.innerWidth, height: Math.max(0, box.top) },
    { top: bottom, left: 0, width: window.innerWidth, height: Math.max(0, window.innerHeight - bottom) },
    { top: Math.max(0, box.top), left: 0, width: Math.max(0, box.left), height: Math.max(0, box.height) },
    { top: Math.max(0, box.top), left: right, width: Math.max(0, window.innerWidth - right), height: Math.max(0, box.height) },
  ]
})

const cardStyle = computed(() => {
  const box = spot.value
  if (!box || typeof window === 'undefined') return {}
  const below = box.top + box.height + GAP + CARD_HEIGHT <= window.innerHeight || box.top < CARD_HEIGHT + GAP
  const top = below ? box.top + box.height + GAP : box.top - GAP - CARD_HEIGHT
  const rightmost = Math.max(MARGIN, window.innerWidth - CARD_WIDTH - MARGIN)
  return {
    top: `${Math.max(MARGIN, top)}px`,
    left: `${Math.min(Math.max(box.left, MARGIN), rightmost)}px`,
  }
})

const last = computed(() => tutorialIndex.value + 1 >= tutorialCount.value)

function measure() {
  if (!anchor) return
  const box = anchor.getBoundingClientRect()
  rect.value = { top: box.top, left: box.left, width: box.width, height: box.height }
}

function clearPoll() {
  if (poll === null) return
  clearInterval(poll)
  poll = null
}

// A step's control can mount a few frames late, and a collapsed layout keeps
// hidden copies of some anchors, so only a laid-out match counts.
function visibleAnchor(target: string): HTMLElement | null {
  for (const element of document.querySelectorAll<HTMLElement>(`[data-tutorial="${target}"]`)) {
    const box = element.getBoundingClientRect()
    if (box.width > 0 && box.height > 0) return element
  }
  return null
}

function locate(target: string) {
  if (typeof document === 'undefined') return
  const token = (pollToken += 1)
  const deadline = Date.now() + POLL_LIMIT_MS
  const tick = () => {
    if (token !== pollToken) return clearPoll()
    const found = visibleAnchor(target)
    if (found) {
      clearPoll()
      anchor = found
      found.scrollIntoView({ block: 'center', behavior: 'smooth' })
      measure()
    } else if (Date.now() > deadline) {
      clearPoll()
    }
  }
  tick()
  if (!anchor) poll = setInterval(tick, POLL_MS)
}

watch(
  () => tutorialStep.value?.id,
  () => {
    rect.value = null
    anchor = null
    clearPoll()
    const target = tutorialStep.value?.target
    if (target) locate(target)
  },
  { immediate: true },
)

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') exitTutorial()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', measure)
  window.addEventListener('scroll', measure, true)
})
onUnmounted(() => {
  clearPoll()
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', measure)
  window.removeEventListener('scroll', measure, true)
})
</script>

<template>
  <Teleport to="body">
    <!-- data-portal-list: a dialog underneath must not read a click in here as
         an interaction outside itself and close. -->
    <div data-portal-list class="pointer-events-none fixed inset-0 z-[70]">
      <div
        v-for="(panel, index) in panels"
        :key="index"
        class="absolute bg-slate-950/40"
        :style="{ top: `${panel.top}px`, left: `${panel.left}px`, width: `${panel.width}px`, height: `${panel.height}px` }"
        aria-hidden="true"
      />
      <div
        v-if="spot"
        class="absolute rounded-lg ring-2 ring-primary transition-all duration-200 motion-reduce:transition-none"
        :style="spotStyle"
        aria-hidden="true"
      />
      <Card
        class="pointer-events-auto absolute w-[21rem] max-w-[calc(100vw-2rem)] overflow-hidden border-primary/25 bg-card/95 p-0 shadow-xl backdrop-blur transition-[top,left] duration-200 motion-reduce:transition-none"
        :class="spot ? '' : 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'"
        :style="cardStyle"
        role="dialog"
        aria-live="polite"
        :aria-label="tutorialStep?.title"
      >
        <div class="h-0.5 w-full bg-gradient-to-r from-primary via-primary/40 to-transparent" aria-hidden="true" />
        <div class="p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Tutorial</p>
              <h2 class="mt-1 font-display text-sm font-semibold text-aruna-navy">{{ tutorialStep?.title }}</h2>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="icon-sm" aria-label="Start the tutorial again" title="Start again" @click="restartTutorial">
                <RotateCcw class="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Exit the tutorial" title="Exit" @click="exitTutorial">
                <X class="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <p class="mt-2 text-sm leading-relaxed text-foreground/85">{{ tutorialStep?.body }}</p>
          <div class="mt-4 flex items-center justify-between gap-2">
            <span class="text-[11px] text-muted-foreground">Step {{ tutorialIndex + 1 }} of {{ tutorialCount }}</span>
            <div class="flex items-center gap-2">
              <Button variant="outline" size="sm" :disabled="tutorialIndex === 0" @click="backTutorialStep">Back</Button>
              <Button size="sm" @click="nextTutorialStep">{{ last ? 'Finish' : 'Next' }}</Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  </Teleport>
</template>
