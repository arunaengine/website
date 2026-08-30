<script setup lang="ts">
import { computed, ref } from 'vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import { cn, copyToClipboard } from '@/lib/utils'

const props = defineProps<{ value: string; count?: number; class?: string }>()

const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

// Hover and non-hover devices both need the untruncated text, count included.
const full = computed(() => (props.count === undefined ? props.value : `${props.value} · ${props.count}`))
const classes = computed(() => cn('chip max-w-[12rem]', props.class))

async function copy() {
  await copyToClipboard(props.value)
  copied.value = true
  clearTimeout(timer)
  timer = setTimeout(() => (copied.value = false), 1500)
}
</script>

<template>
  <Tooltip :label="full">
    <button type="button" :class="classes" :aria-label="`Copy ${value}`" :title="full" @click="copy">
      <span class="truncate" aria-live="polite">{{ copied ? 'Copied' : value }}</span>
      <span v-if="count !== undefined" class="shrink-0">· {{ count }}</span>
    </button>
  </Tooltip>
</template>
