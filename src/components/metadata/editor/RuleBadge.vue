<script setup lang="ts">
import { computed } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import { obligationBadgeVariant, PROFILE_OBLIGATION_LABELS } from '@/lib/profiles/labels'
import type { ProfileObligation, ProfilePropertyRule } from '@/lib/profiles/types'
import { CircleAlert, Lightbulb } from '@lucide/vue'

// What the picked profile asks of one empty field, beside its input: the
// issue list's colour and mark for it, and the word only while it fits.
const props = defineProps<{ rule?: ProfilePropertyRule | null }>()

const obligation = computed<ProfileObligation | null>(() => {
  const asked = props.rule?.obligation
  return asked === 'MUST' || asked === 'SHOULD' ? asked : null
})
const label = computed(() => (obligation.value ? PROFILE_OBLIGATION_LABELS[obligation.value].label : ''))
const icon = computed(() => (obligation.value === 'MUST' ? CircleAlert : Lightbulb))
</script>

<template>
  <Badge
    v-if="obligation"
    :variant="obligationBadgeVariant(obligation)"
    size="sm"
    class="mt-2.5 shrink-0 gap-1 uppercase tracking-wide"
    :title="label"
  >
    <component :is="icon" class="h-3 w-3" aria-hidden="true" />
    <span class="sr-only @3xs:not-sr-only">{{ label }}</span>
  </Badge>
</template>
