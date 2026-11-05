<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'

// The actions stay pinned to the bottom while a tall dialog scrolls; the shadow covers its padding.
const props = defineProps<{ class?: string }>()
const classes = computed(() =>
  cn(
    'sticky bottom-0 z-10 flex flex-col-reverse gap-2 bg-[var(--dialog-surface)] shadow-[0_1.5rem_0_var(--dialog-surface)] sm:flex-row sm:justify-end sm:space-x-2',
    props.class,
  ),
)
</script>

<template>
  <div :class="classes"><slot /></div>
</template>
