<script setup lang="ts">
// One decision of the Resources or Placement card: its label, whether it was changed from the
// default, and the value with its note behind an info icon. Editing replaces the value in place.
import { Info } from '@lucide/vue'
import Tooltip from '@/components/ui/Tooltip.vue'

defineProps<{ label: string; tag: string; value: string; sub?: string }>()
</script>

<template>
  <div class="min-w-0">
    <dt class="type-label">{{ label }}<template v-if="tag !== 'default'">, {{ tag }}</template></dt>
    <dd class="mt-1 min-w-0">
      <slot>
        <span class="inline-flex max-w-full items-center gap-1 text-sm leading-5 text-foreground">
          <span class="truncate" :title="value">{{ value }}</span>
          <Tooltip v-if="sub" :label="sub">
            <span class="inline-flex shrink-0 text-muted-foreground" tabindex="0" :aria-label="sub"><Info class="size-3.5" aria-hidden="true" /></span>
          </Tooltip>
        </span>
      </slot>
    </dd>
  </div>
</template>
