<script setup lang="ts">
// The tour's own layer: a cutout over the anchored control and one step card.
// The backdrop swallows clicks, so the tour is driven from the card alone.
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import { X } from '@lucide/vue'
import { computed, onMounted, onUnmounted } from 'vue'
import {
  currentStep,
  nextStep,
  prevStep,
  stopTour,
  tourCount,
  tourIndex,
  tourRect,
} from '@/composables/useTour'

const PAD = 8
const GAP = 12
const CARD_WIDTH = 320
const CARD_HEIGHT = 190
const MARGIN = 16

const spot = computed(() => {
  const box = tourRect.value
  if (!box) return null
  return {
    top: box.top - PAD,
    left: box.left - PAD,
    width: box.width + PAD * 2,
    height: box.height + PAD * 2,
  }
})

const spotStyle = computed(() =>
  spot.value
    ? {
        top: `${spot.value.top}px`,
        left: `${spot.value.left}px`,
        width: `${spot.value.width}px`,
        height: `${spot.value.height}px`,
        boxShadow: '0 0 0 9999px rgb(2 6 23 / 0.55)',
      }
    : {},
)

// Below the target unless the viewport has no room for the card there.
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

const last = computed(() => tourIndex.value + 1 >= tourCount.value)

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') stopTour()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[70]">
      <div
        v-if="spot"
        class="absolute rounded-lg ring-2 ring-primary transition-all duration-200"
        :style="spotStyle"
        aria-hidden="true"
      />
      <Card
        class="absolute w-80 max-w-[calc(100vw-2rem)] p-4 shadow-xl"
        :class="spot ? '' : 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'"
        :style="cardStyle"
        role="dialog"
        aria-live="polite"
        :aria-label="currentStep?.title"
      >
        <div class="flex items-start justify-between gap-3">
          <h2 class="font-display text-sm font-semibold text-aruna-navy">{{ currentStep?.title }}</h2>
          <Button variant="ghost" size="icon-sm" aria-label="End the tour" @click="stopTour">
            <X class="h-3.5 w-3.5" />
          </Button>
        </div>
        <p class="mt-2 text-sm leading-relaxed text-foreground/85">{{ currentStep?.body }}</p>
        <div class="mt-4 flex items-center justify-between gap-2">
          <span class="text-[11px] tabular-nums text-muted-foreground">
            {{ tourIndex + 1 }} of {{ tourCount }}
          </span>
          <div class="flex items-center gap-2">
            <Button variant="outline" size="sm" :disabled="tourIndex === 0" @click="prevStep">Back</Button>
            <Button size="sm" @click="last ? stopTour() : nextStep()">{{ last ? 'Done' : 'Next' }}</Button>
          </div>
        </div>
      </Card>
    </div>
  </Teleport>
</template>
