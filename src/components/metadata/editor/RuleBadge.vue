<script setup lang="ts">
import { computed } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import { obligationBadgeVariant, PROFILE_OBLIGATION_LABELS } from '@/lib/profiles/labels'
import type { ProfileObligation, ProfilePropertyRule } from '@/lib/profiles/types'
import { CircleAlert, TriangleAlert } from '@lucide/vue'

// What the picked profile asks of one empty field, inside the field, in the
// colour and mark the issue list uses for it; the word only while it fits.
const props = defineProps<{
  rule?: ProfilePropertyRule | null
  /** Keep clear of a select's arrow. */
  inset?: boolean
}>()

const obligation = computed<ProfileObligation | null>(() => {
  const asked = props.rule?.obligation
  return asked === 'MUST' || asked === 'SHOULD' ? asked : null
})
const label = computed(() => (obligation.value ? PROFILE_OBLIGATION_LABELS[obligation.value].label : ''))
const icon = computed(() => (obligation.value === 'MUST' ? CircleAlert : TriangleAlert))
</script>

<template>
  <Badge
    v-if="obligation"
    :variant="obligationBadgeVariant(obligation)"
    size="sm"
    class="pointer-events-none absolute top-2.5 gap-1 uppercase tracking-wide"
    :class="inset ? 'right-9' : 'right-2'"
    :title="label"
  >
    <component :is="icon" class="h-3 w-3" aria-hidden="true" />
    <span class="sr-only @xs:not-sr-only">{{ label }}</span>
  </Badge>
</template>
