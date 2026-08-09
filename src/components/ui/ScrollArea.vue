<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{ class?: string; label?: string }>()
const classes = computed(() => cn('overflow-y-auto scrollbar-thin', props.class))
</script>
<template>
  <div tabindex="0" :role="label ? 'region' : undefined" :aria-label="label" :class="classes"><slot /></div>
</template>
