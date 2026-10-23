<script setup lang="ts">
// Data strategy and metadata coverage of each chosen node.
import NodeLabel from '@/components/ui/NodeLabel.vue'
import Select from '@/components/ui/Select.vue'
import {
  COVERAGES,
  roleLabel,
  STRATEGIES,
  type Coverage,
  type DataStrategy,
  type MemberDraft,
  type PresetId,
} from '@/lib/distributedMock'

const props = defineProps<{ modelValue: MemberDraft[]; preset: PresetId }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: MemberDraft[]): void }>()

const strategyOptions = STRATEGIES.map(({ value, label }) => ({ value, label }))
const coverageOptions = COVERAGES.map(({ value, label }) => ({ value, label }))

function change(nodeId: string, patch: Partial<{ strategy: DataStrategy; coverage: Coverage }>) {
  emit('update:modelValue', props.modelValue.map((member) => (member.nodeId === nodeId ? { ...member, ...patch } : member)))
}
</script>

<template>
  <div class="overflow-x-auto rounded-md border border-border">
    <table class="w-full min-w-[36rem] text-left text-xs">
      <thead class="border-b border-border bg-muted/40 text-muted-foreground">
        <tr>
          <th class="px-3 py-2 font-medium">Node</th>
          <th class="px-3 py-2 font-medium">Role</th>
          <th class="w-40 px-3 py-2 font-medium">Data strategy</th>
          <th class="w-36 px-3 py-2 font-medium">Metadata coverage</th>
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
              :aria-label="`Data strategy on ${member.nodeId}`"
              @update:model-value="change(member.nodeId, { strategy: $event as DataStrategy })"
            />
          </td>
          <td class="px-3 py-2">
            <Select
              :model-value="member.coverage"
              :options="coverageOptions"
              :aria-label="`Metadata coverage on ${member.nodeId}`"
              @update:model-value="change(member.nodeId, { coverage: $event as Coverage })"
            />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
