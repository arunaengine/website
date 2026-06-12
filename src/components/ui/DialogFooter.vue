<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{ class?: string }>()
const classes = computed(() =>
  cn(
    'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:space-x-2',
    props.class,
  ),
)
</script>

<template>
  <div :class="classes"><slot /></div>
</template>
