<script setup lang="ts">
// A stat card: the label, the figure with its unit, a neutral icon tile and a footer of icon facts
// (each number in <b>). With `to` the whole card opens that page; `stacked` puts the facts in a
// column, and an action slot adds a button below them.
import type { Component } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import { Info } from '@lucide/vue'
import IconTile from '@/components/ui/IconTile.vue'
import Tooltip from '@/components/ui/Tooltip.vue'

withDefaults(defineProps<{ label: string; icon: Component; info?: string; to?: RouteLocationRaw; stacked?: boolean }>(), {
  info: undefined,
  to: undefined,
})
</script>

<template>
  <component
    :is="to ? RouterLink : 'div'"
    :to="to"
    class="flex h-full min-w-0 flex-col gap-3 rounded-xl border border-border-subtle bg-card p-4 text-card-foreground shadow-sm transition-colors dark:shadow-none sm:gap-4 sm:p-5"
    :class="to ? 'hover:border-primary/40' : ''"
  >
    <div class="flex flex-col-reverse items-start justify-between gap-3 sm:flex-row">
      <div class="min-w-0">
        <p class="type-label flex items-center gap-1.5">
          <slot name="label">{{ label }}</slot>
          <Tooltip v-if="info" :label="info">
            <span class="inline-flex text-muted-foreground" tabindex="0" :aria-label="info"><Info class="size-3.5" aria-hidden="true" /></span>
          </Tooltip>
        </p>
        <p class="mt-2 flex flex-wrap items-baseline gap-x-2">
          <span class="type-number max-sm:text-xl"><slot name="value" /></span>
          <span v-if="$slots.unit" class="text-sm text-muted-foreground"><slot name="unit" /></span>
        </p>
      </div>
      <IconTile :icon="icon" tone="muted" />
    </div>
    <div
      v-if="$slots.default"
      class="mt-auto flex gap-x-5 gap-y-1 type-secondary [&_b]:whitespace-nowrap [&_b]:font-medium [&_b]:text-foreground [&>span]:inline-flex [&>span]:items-center [&>span]:gap-1.5 [&_svg]:size-3.5 [&_svg]:shrink-0"
      :class="stacked ? 'flex-col' : 'flex-wrap max-sm:flex-col'"
    >
      <slot />
    </div>
    <div v-if="$slots.action" class="flex"><slot name="action" /></div>
  </component>
</template>
