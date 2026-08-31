<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowRightLeft } from '@lucide/vue'
import Badge from '@/components/ui/Badge.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import { JOB_STATE_META, placementVerdict, type JobState } from '@/lib/jobs'
import { tesPlacementLike, tesPlacementTags } from '@/lib/tes'
import { formatBytes, truncateMiddle } from '@/lib/utils'

const NODE_LABEL_KEY = 'aruna-engine.org/node'

// Placement outcome tags from BASIC/FULL views plus the label constraints the
// caller submitted. Without either kind, this renders nothing at all.
const props = defineProps<{ tags?: Record<string, string>; compact?: boolean }>()

const placement = computed(() => tesPlacementTags(props.tags))
const labelConstraints = computed(() => Object.entries(placement.value.labelConstraints))
const like = computed(() => tesPlacementLike(placement.value))
const verdict = computed(() => (like.value ? placementVerdict(like.value) : null))
const verdictVariant = computed(() =>
  verdict.value?.verdict === 'compute-to-data'
    ? 'success'
    : verdict.value?.verdict === 'data-to-compute'
      ? 'sky'
      : 'secondary',
)
// The compact list line colors the verdict text instead of stacking badges.
const verdictTextClass = computed(() =>
  verdict.value?.verdict === 'compute-to-data'
    ? 'text-emerald-600 dark:text-emerald-400'
    : verdict.value?.verdict === 'data-to-compute'
      ? 'text-sky-600 dark:text-sky-400'
      : 'text-muted-foreground',
)
// The logical state is a JobState, so it is worded by the shared state map.
const logicalStateLabel = computed(() => {
  const state = placement.value.logicalState
  if (!state) return ''
  return JOB_STATE_META[state as JobState]?.label ?? state
})
const anything = computed(
  () =>
    Boolean(placement.value.jobId)
    || Boolean(placement.value.logicalState)
    || Boolean(placement.value.executorKind)
    || placement.value.estimatedTransferBytes !== undefined
    || (!props.compact && labelConstraints.value.length > 0),
)
</script>

<template>
  <!-- Compact list line: one colored verdict with an icon, then the logical
       state as muted text, so the State column stays a tidy two lines. -->
  <div v-if="compact && anything" class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-tight">
    <span
      v-if="verdict"
      class="inline-flex items-center gap-1 font-medium"
      :class="verdictTextClass"
      :title="verdict.explanation"
    >
      <ArrowRightLeft class="h-3 w-3 shrink-0" />
      {{ verdict.label }}
    </span>
    <span v-if="placement.logicalState" class="text-muted-foreground" title="Logical state">
      {{ logicalStateLabel }}
    </span>
  </div>

  <div v-else-if="anything" class="flex flex-wrap items-center gap-1.5 text-[11px]">
    <Badge v-if="verdict" :variant="verdictVariant" size="sm" :title="verdict.explanation">
      {{ verdict.label }}
    </Badge>
    <Badge v-if="placement.logicalState" variant="outline" size="sm" title="Logical state">
      {{ logicalStateLabel }}
    </Badge>
    <template v-if="!compact">
      <span v-if="placement.executorKind" class="text-muted-foreground">
        executor <span class="font-mono text-foreground">{{ placement.executorKind }}</span>
      </span>
      <span v-if="placement.estimatedTransferBytes !== undefined" class="text-muted-foreground">
        transfer ~{{ formatBytes(placement.estimatedTransferBytes) }}
      </span>
      <Badge
        v-for="[key, value] in labelConstraints"
        :key="key"
        variant="outline"
        size="sm"
        :class="key === NODE_LABEL_KEY ? '' : 'font-mono'"
      >
        <template v-if="key === NODE_LABEL_KEY">
          node: <NodeLabel :node-id="value" size="sm" />
        </template>
        <template v-else>{{ key }}={{ value }}</template>
      </Badge>
      <RouterLink
        v-if="placement.jobId"
        :to="{ name: 'job', params: { jobId: placement.jobId } }"
        class="font-mono text-primary hover:underline"
        :title="`Open system job ${placement.jobId}`"
      >{{ truncateMiddle(placement.jobId) }}</RouterLink>
    </template>
  </div>
</template>
