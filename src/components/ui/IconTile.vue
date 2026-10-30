<script setup lang="ts">
// An icon in a tinted square, as stat cards, rows and the group switcher lead with it.
import type { Component } from 'vue'

export type TileTone = 'royal' | 'aqua' | 'sky' | 'ok' | 'warn' | 'failed' | 'muted'

const TONES: Record<TileTone, string> = {
  royal: 'bg-aruna-royal/15 text-primary',
  aqua: 'bg-aruna-aqua/15 text-aruna-navy dark:text-aruna-aqua',
  sky: 'bg-aruna-sky/10 text-sky-700 dark:text-aruna-aqua',
  ok: 'bg-status-ok/10 text-status-ok',
  warn: 'bg-status-warn/10 text-status-warn',
  failed: 'bg-status-failed/10 text-status-failed',
  muted: 'bg-muted text-muted-foreground',
}

withDefaults(defineProps<{ icon: Component; tone?: TileTone; size?: 'sm' | 'lg' }>(), { tone: 'royal', size: 'lg' })
</script>

<template>
  <span class="grid shrink-0 place-items-center rounded-lg" :class="[TONES[tone], size === 'lg' ? 'size-10' : 'size-8']" aria-hidden="true">
    <component :is="icon" :class="size === 'lg' ? 'size-5' : 'size-4'" />
  </span>
</template>
