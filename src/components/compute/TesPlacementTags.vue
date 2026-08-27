<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import { placementVerdict } from '@/lib/jobs'
import { tesPlacementLike, tesPlacementTags } from '@/lib/tes'
import { formatBytes, truncateMiddle } from '@/lib/utils'

// Placement outcome tags from BASIC/FULL views plus the label constraints the
// caller submitted. Without either kind, this renders nothing at all.
const props = defineProps<{ tags?: Record<string, string>; compact?: boolean }>()

const placement = computed(() => tesPlacementTags(props.tags))
const labelConstraints = computed(() => Object.entries(placement.value.labelConstraints))
const like = computed(() => tesPlacementLike(placement.value))
const verdict = computed(() => (like.value ? placementVerdict(like.value) : null))
const verdictVariant = computed(() =>
  verdict.value?.verdict === 'compute-to-data' ? 'success' : 'sky',
)
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
  <div v-if="anything" class="flex flex-wrap items-center gap-1.5 text-[11px]">
    <Badge v-if="verdict" :variant="verdictVariant" class="text-[10px]" :title="verdict.explanation">
      {{ verdict.label }}
    </Badge>
    <Badge v-if="placement.logicalState" variant="outline" class="text-[10px]">
      {{ placement.logicalState }}
    </Badge>
    <template v-if="!compact">
      <span v-if="placement.executorKind" class="text-muted-foreground">
        executor <span class="font-mono text-foreground">{{ placement.executorKind }}</span>
      </span>
      <span v-if="placement.estimatedTransferBytes !== undefined" class="text-muted-foreground">
        estimated transfer {{ formatBytes(placement.estimatedTransferBytes) }}
      </span>
      <Badge
        v-for="[key, value] in labelConstraints"
        :key="key"
        variant="outline"
        class="font-mono text-[10px]"
      >
        {{ key }}={{ value }}
      </Badge>
      <RouterLink
        v-if="placement.jobId"
        :to="{ name: 'job-detail', params: { jobId: placement.jobId } }"
        class="font-mono text-primary hover:underline"
        :title="`Open native job ${placement.jobId}`"
      >{{ truncateMiddle(placement.jobId) }}</RouterLink>
    </template>
  </div>
</template>
