<script setup lang="ts">
// A dataset's type as one pill; a run adds a check or a cross for its outcome.
import { computed } from 'vue'
import { CircleCheck, CircleX } from '@lucide/vue'
import Badge from '@/components/ui/Badge.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import { crateRunState, crateTypeLabel, type CrateType } from '@/lib/crateType'

// `part`: a list shows the pill and the outcome in separate columns.
const props = withDefaults(defineProps<{ type: CrateType; crate?: unknown; part?: 'both' | 'type' | 'state' }>(), {
  crate: undefined,
  part: 'both',
})
const state = computed(() => (props.type.endsWith('-run') ? crateRunState(props.crate) : null))
const stateLabel = computed(() => (state.value === 'failed' ? 'Failed' : 'Succeeded'))
</script>

<template>
  <span class="inline-flex shrink-0 items-center gap-1.5">
    <Badge v-if="part !== 'state'">{{ crateTypeLabel(type) }}</Badge>
    <Tooltip v-if="state && part !== 'type'" :label="stateLabel">
      <span
        role="img"
        :aria-label="stateLabel"
        tabindex="0"
        class="inline-flex"
        :class="state === 'failed' ? 'text-status-failed' : 'text-status-ok'"
      >
        <component :is="state === 'failed' ? CircleX : CircleCheck" class="size-4" aria-hidden="true" />
      </span>
    </Tooltip>
  </span>
</template>
