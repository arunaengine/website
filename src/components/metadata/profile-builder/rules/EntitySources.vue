<script setup lang="ts">
import { computed } from 'vue'
import { PROFILE_ENTITY_SOURCE_LABELS } from '@/lib/profiles/labels'
import { ENTITY_SOURCE_ORDER, effectiveEntitySources, normalizeEntitySources } from '@/lib/profiles/sources'
import type { ProfileEntitySource } from '@/lib/profiles/types'
import type { DraftPropertyRule } from '../useProfileBuilder'

const props = defineProps<{
  property: DraftPropertyRule
  disabled: boolean
}>()

const selectedSources = computed<ProfileEntitySource[]>(() => effectiveEntitySources(props.property.entitySources))
const entitySourceOptions = ENTITY_SOURCE_ORDER.map((source) => ({ source, ...PROFILE_ENTITY_SOURCE_LABELS[source] }))

function toggleEntitySource(source: ProfileEntitySource) {
  const current = new Set(selectedSources.value)
  if (current.has(source)) {
    // At least one source must stay allowed, otherwise the rule is unfulfillable.
    if (current.size === 1) return
    current.delete(source)
  } else {
    current.add(source)
  }
  // The legacy default (exactly ['new']) stores as absent so byte-stability holds.
  props.property.entitySources = normalizeEntitySources([...current])
}
</script>

<template>
  <div>
    <label class="text-[11px] font-medium text-muted-foreground">Allowed sources</label>
    <div class="mt-1 space-y-1">
      <label
        v-for="option in entitySourceOptions"
        :key="option.source"
        class="flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-1.5 text-[11px] transition-colors"
        :class="selectedSources.includes(option.source)
          ? 'border-aruna-royal/60 bg-aruna-royal/10'
          : 'border-border hover:border-primary/40'"
      >
        <input
          type="checkbox"
          class="mt-0.5 accent-aruna-royal"
          :checked="selectedSources.includes(option.source)"
          :disabled="disabled || (selectedSources.length === 1 && selectedSources.includes(option.source))"
          @change="toggleEntitySource(option.source)"
        />
        <span>
          <span class="font-medium text-foreground">{{ option.label }}</span>
          <span class="block text-muted-foreground">{{ option.help }}</span>
        </span>
      </label>
    </div>
  </div>
</template>
