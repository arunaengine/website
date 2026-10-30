<script setup lang="ts">
// A small icon tile that leads a row; its meaning is the tooltip and the accessible name.
import type { Component } from 'vue'
import IconTile, { type TileTone } from '@/components/ui/IconTile.vue'
import Tooltip from '@/components/ui/Tooltip.vue'

defineProps<{ icon: Component; tone?: TileTone; label: string }>()
</script>

<template>
  <Tooltip :label="label">
    <span class="inline-flex" role="img" :aria-label="label" tabindex="0"><IconTile :icon="icon" :tone="tone" size="sm" /></span>
  </Tooltip>
</template>
