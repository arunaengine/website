<script setup lang="ts">
// Identity of one run: its name, its state, its id and the placement tags the
// node reported for it.
import CopyButton from '@/components/nodes/CopyButton.vue'
import TaskStateBadge from '@/components/compute/TaskStateBadge.vue'
import TesPlacementTags from '@/components/compute/TesPlacementTags.vue'
import type { TesState } from '@/lib/tes'
import { truncateMiddle } from '@/lib/utils'

withDefaults(
  defineProps<{
    title: string
    runId: string
    state?: TesState
    tags?: Record<string, string>
    description?: string
    compact?: boolean
  }>(),
  { state: undefined, tags: undefined, description: '', compact: false },
)
</script>

<template>
  <div class="min-w-0 space-y-2">
    <div class="flex flex-wrap items-center gap-2">
      <component
        :is="compact ? 'h3' : 'h2'"
        :class="compact ? 'text-sm font-semibold text-foreground' : 'font-display text-lg font-semibold text-aruna-navy'"
      >
        {{ title }}
      </component>
      <TaskStateBadge :state="state" />
      <slot name="badges" />
    </div>
    <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
      <span class="font-mono" :title="runId">{{ truncateMiddle(runId) }}</span>
      <CopyButton :value="runId" label="Copy run id" />
      <slot name="meta" />
    </div>
    <p v-if="description" class="text-sm text-muted-foreground">{{ description }}</p>
    <TesPlacementTags :tags="tags" />
  </div>
</template>
