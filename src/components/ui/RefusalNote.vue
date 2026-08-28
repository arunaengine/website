<script setup lang="ts">
// A refusal the way the composables word it: the first line names it and each
// line after it says what to do. A single line renders as plain text.
import { computed } from 'vue'
import Notice from './Notice.vue'

const props = withDefaults(defineProps<{ message: string; tone?: 'error' | 'warning' }>(), {
  tone: 'error',
})

const lines = computed(() =>
  props.message
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean),
)
</script>

<template>
  <Notice
    :tone="tone"
    :title="lines.length > 1 ? lines[0] : undefined"
    :lines="lines.slice(1)"
  >
    <p v-if="lines.length <= 1">{{ lines[0] }}</p>
  </Notice>
</template>
