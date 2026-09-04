<script setup lang="ts">
// Marks a field the assistant filled in. It disappears as soon as the user
// edits that field.
import { Sparkles } from '@lucide/vue'
</script>

<template>
  <span
    class="inline-flex items-center gap-0.5 rounded bg-aruna-sky/10 px-1.5 text-[9.5px] font-semibold uppercase tracking-wide leading-4 text-sky-700 dark:text-aruna-aqua"
    title="Filled in by the assistant"
  >
    <Sparkles class="size-2.5" aria-hidden="true" /> AI
  </span>
</template>
