<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'
const props = defineProps<{ class?: string }>()
const classes = computed(() =>
  cn('font-display text-base font-semibold tracking-tight text-foreground', props.class),
)
</script>
<template>
  <h3 :class="classes"><slot /></h3>
</template>
