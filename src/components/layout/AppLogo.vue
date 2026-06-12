<script setup lang="ts">
import { computed } from 'vue'
import { useTheme } from '@/composables/useTheme'

// The ARUNA wordmark is a custom typeface and must never be typed in a
// UI font — only the pre-aligned image lockups from /brand are used.
const props = withDefaults(
  defineProps<{
    /** Rendered height of the mark in px */
    size?: number
    /** 'lockup' = icon + ARUNA wordmark image · 'icon' = wave mark only */
    variant?: 'lockup' | 'icon'
    subtitle?: string
    class?: string
  }>(),
  {
    size: 24,
    variant: 'lockup',
    subtitle: '',
  },
)

const { isDark } = useTheme()

const src = computed(() => {
  if (props.variant === 'icon') return '/brand/icon-mark.png'
  return isDark.value
    ? '/brand/lockup-horizontal-white.png'
    : '/brand/lockup-horizontal.png'
})

/* lockup-horizontal.png is 1867×342 */
const width = computed(() =>
  props.variant === 'icon' ? props.size : Math.round(props.size * (1867 / 342)),
)
</script>

<template>
  <div :class="['flex flex-col items-start', $props.class]">
    <img
      :src="src"
      :height="size"
      :width="width"
      :style="{ height: `${size}px`, width: 'auto' }"
      alt="Aruna"
      class="shrink-0 select-none self-start"
      draggable="false"
    />
    <span
      v-if="subtitle && variant === 'lockup'"
      class="tagline mt-1.5 text-[9px]"
    >
      {{ subtitle }}
    </span>
  </div>
</template>
