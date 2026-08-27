<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle, Check } from '@lucide/vue'

// Icon only: the numbers live in the coverage modal, never in a chip.
const props = defineProps<{ complete: boolean; compact?: boolean }>()

const label = computed(() => `Search coverage: ${props.complete ? 'complete' : 'partial'}`)
</script>

<template>
  <button
    type="button"
    class="inline-flex shrink-0 items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
    :class="complete ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'"
    :aria-label="label"
    :title="label"
  >
    <Check v-if="complete" :class="compact ? 'h-3.5 w-3.5' : 'h-4 w-4'" aria-hidden="true" />
    <AlertTriangle v-else :class="compact ? 'h-3.5 w-3.5' : 'h-4 w-4'" aria-hidden="true" />
  </button>
</template>
