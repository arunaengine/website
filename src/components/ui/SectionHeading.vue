<script setup lang="ts">
// The heading above a card: a muted icon, the title, an optional info icon whose tooltip explains
// the section, and the section's own actions at the right.
import type { Component } from 'vue'
import { Info } from '@lucide/vue'
import Tooltip from '@/components/ui/Tooltip.vue'

withDefaults(
  defineProps<{ title: string; icon?: Component; info?: string; level?: 2 | 3; id?: string; count?: string }>(),
  { icon: undefined, info: undefined, level: 2, id: undefined, count: undefined },
)
</script>

<template>
  <div class="mb-4 flex min-h-9 flex-wrap items-center justify-between gap-x-4 gap-y-2">
    <div class="flex min-w-0 items-center gap-2">
      <component :is="icon" v-if="icon" class="size-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
      <component :is="`h${level}`" :id="id" class="type-section-title min-w-0 truncate">{{ title }}</component>
      <span v-if="count" class="shrink-0 text-sm tabular-nums text-muted-foreground">{{ count }}</span>
      <Tooltip v-if="info" :label="info">
        <button type="button" class="inline-flex shrink-0 rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" :aria-label="`About ${title}`">
          <Info class="size-4" aria-hidden="true" />
        </button>
      </Tooltip>
    </div>
    <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
