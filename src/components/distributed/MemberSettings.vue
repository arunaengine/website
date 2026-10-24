<script setup lang="ts">
// What each chosen node keeps. Metadata coverage follows the layout.
import NodeLabel from '@/components/ui/NodeLabel.vue'
import { useRealmNodes } from '@/composables/useRealmNodes'
import Select from '@/components/ui/Select.vue'
import { roleLabel, STRATEGIES, type DataStrategy, type MemberDraft, type PresetId } from '@/lib/distributedMock'

const props = defineProps<{ modelValue: MemberDraft[]; preset: PresetId }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: MemberDraft[]): void }>()

const { displayName } = useRealmNodes()
const strategyOptions = STRATEGIES.map(({ value, label }) => ({ value, label }))

function change(nodeId: string, patch: Partial<{ strategy: DataStrategy }>) {
  emit('update:modelValue', props.modelValue.map((member) => (member.nodeId === nodeId ? { ...member, ...patch } : member)))
}
</script>

<template>
  <div class="overflow-x-auto rounded-md border border-border">
    <table class="w-full min-w-[28rem] text-left text-xs">
      <thead class="border-b border-border bg-muted/40 text-muted-foreground">
        <tr>
          <th class="px-3 py-2 font-medium">Node</th>
          <th class="px-3 py-2 font-medium">Role</th>
          <th class="w-40 px-3 py-2 font-medium">Data strategy</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border">
        <tr v-for="(member, index) in modelValue" :key="member.nodeId">
          <td class="px-3 py-2 font-medium"><NodeLabel :node-id="member.nodeId" /></td>
          <td class="px-3 py-2">{{ roleLabel(preset, index, member) }}</td>
          <td class="px-3 py-2">
            <Select
              :model-value="member.strategy"
              :options="strategyOptions"
              :aria-label="`Data strategy on ${displayName(member.nodeId)}`"
              @update:model-value="change(member.nodeId, { strategy: $event as DataStrategy })"
            />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
