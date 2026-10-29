<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{ class?: string }>()
const classes = computed(() =>
  cn(
    'rounded-xl border border-border-subtle bg-card text-card-foreground shadow-sm dark:shadow-none',
    props.class,
  ),
)
</script>

<template>
  <div :class="classes"><slot /></div>
</template>
