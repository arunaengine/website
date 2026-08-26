<script setup lang="ts">
// A refusal the way the composables word it: the first line names it and each
// line after it says what to do. A single line renders as plain text.
import { computed } from 'vue'

const props = withDefaults(defineProps<{ message: string; tone?: 'error' | 'warning' }>(), { tone: 'error' })

const lines = computed(() =>
  props.message
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean),
)
</script>

<template>
  <div
    :class="[
      'rounded-md border px-3 py-2 text-xs leading-relaxed',
      tone === 'warning'
        ? 'border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-300'
        : 'border-destructive/30 bg-destructive/5 text-destructive',
    ]"
  >
    <p :class="lines.length > 1 ? 'font-medium' : ''">{{ lines[0] }}</p>
    <ul v-if="lines.length > 1" class="mt-1 list-disc space-y-0.5 pl-4">
      <li v-for="(line, index) in lines.slice(1)" :key="index">{{ line }}</li>
    </ul>
  </div>
</template>
