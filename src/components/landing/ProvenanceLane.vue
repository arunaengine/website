<script setup lang="ts">
import type { Component } from 'vue'
import { ChevronRight } from '@lucide/vue'

export interface LaneStep {
  icon: Component
  name: string
  note: string
  /** The step that ran, drawn in the accent colour. */
  run?: boolean
}

defineProps<{
  label: string
  steps: LaneStep[]
  /** Fade-in delay of the first step in milliseconds; each next step waits 70 ms more. */
  delay?: number
}>()
</script>

<template>
  <div class="lane" :data-l="label">
    <template v-for="(step, index) in steps" :key="step.name">
      <i v-if="index"><ChevronRight /></i>
      <span class="lstep" :class="{ r: step.run }" :style="delay === undefined ? undefined : { animationDelay: `${delay + index * 70}ms` }">
        <component :is="step.icon" /><em>{{ step.name }}</em><small>{{ step.note }}</small>
      </span>
    </template>
  </div>
</template>
