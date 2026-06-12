<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'
const props = defineProps<{ class?: string }>()
const classes = computed(() => cn('px-5 pb-5 pt-0', props.class))
</script>
<template>
  <div :class="classes"><slot /></div>
</template>
