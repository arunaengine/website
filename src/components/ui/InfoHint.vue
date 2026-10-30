<script setup lang="ts">
// An info icon whose tooltip holds the explanation or raw detail a line leaves out.
import { Info } from '@lucide/vue'
import Tooltip from '@/components/ui/Tooltip.vue'

defineProps<{ label: string; name?: string }>()
</script>

<template>
  <Tooltip :label="label">
    <button
      type="button"
      class="inline-flex shrink-0 rounded-full align-middle text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      :aria-label="name ?? label"
    >
      <Info class="size-3.5" aria-hidden="true" />
    </button>
  </Tooltip>
</template>
