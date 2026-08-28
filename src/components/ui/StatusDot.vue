<script setup lang="ts">
// A coloured dot for a state that has no room for a label. The label is still
// carried for assistive tech.
import { computed } from 'vue'
import { cn } from '@/lib/utils'
import { toneDot, type StateTone } from '@/lib/stateBadge'

const props = withDefaults(defineProps<{ tone: StateTone; label: string; class?: string }>(), {
  class: undefined,
})

const classes = computed(() =>
  cn('inline-block size-2 shrink-0 rounded-full', toneDot(props.tone), props.class),
)
</script>

<template>
  <span :class="classes" role="img" :aria-label="label" :title="label" />
</template>
