<script setup lang="ts">
// The top of a right sheet, in the page header pattern: an object icon in a tile, the title, one
// subtitle line and the sheet's own actions. It leaves room for the sheet's close button.
import type { Component } from 'vue'
import { DialogDescription, DialogTitle } from 'radix-vue'

withDefaults(defineProps<{ title: string; subtitle?: string; icon?: Component }>(), { subtitle: undefined, icon: undefined })
</script>

<template>
  <div class="flex items-start gap-3 border-b border-border-subtle px-6 pb-5 pr-16 pt-5">
    <span v-if="icon" class="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
      <component :is="icon" class="size-5" aria-hidden="true" />
    </span>
    <div class="min-w-0 flex-1">
      <DialogTitle class="type-section-title break-words">
        <slot name="title">{{ title }}</slot>
      </DialogTitle>
      <DialogDescription v-if="subtitle || $slots.subtitle" class="mt-1 text-[13px] leading-[18px] text-muted-foreground">
        <slot name="subtitle">{{ subtitle }}</slot>
      </DialogDescription>
    </div>
    <div v-if="$slots.actions" class="flex shrink-0 items-center gap-1">
      <slot name="actions" />
    </div>
  </div>
</template>
