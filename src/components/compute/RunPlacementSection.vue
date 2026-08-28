<script setup lang="ts">
// Review-step block both run wizards share: where the run executes, which nodes
// it may land on, and every refusal the chosen target implies.
import Notice from '@/components/ui/Notice.vue'
import RunTargetPicker from '@/components/compute/RunTargetPicker.vue'
import PlacementPicker from '@/components/compute/PlacementPicker.vue'
import type { DeviceCompute } from '@/lib/deviceApi'
import type { RunTarget } from '@/composables/useRunTarget'

defineProps<{
  target: RunTarget
  available: boolean
  local: boolean
  compute?: DeviceCompute | null
  realmName: string
  labels: Record<string, string>
  problems: string[]
}>()
const emit = defineEmits<{
  (e: 'update:target', value: RunTarget): void
  (e: 'update:labels', value: Record<string, string>): void
}>()
</script>

<template>
  <div class="space-y-3">
    <RunTargetPicker
      v-if="available"
      :model-value="target"
      :compute="compute"
      :realm-name="realmName"
      @update:model-value="emit('update:target', $event)"
    />
    <PlacementPicker
      v-if="!local"
      :model-value="labels"
      @update:model-value="emit('update:labels', $event)"
    />
    <Notice v-if="problems.length" tone="error" :lines="problems" />
  </div>
</template>
