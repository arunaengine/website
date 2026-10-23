<script setup lang="ts">
// Member nodes with their location and operator label, and one data strategy and
// metadata coverage per member. A node without the shard-host label cannot join.
import Badge from '@/components/ui/Badge.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import Select from '@/components/ui/Select.vue'
import {
  COVERAGES,
  MOCK_NODES,
  roleLabel,
  SHARD_HOST_LABEL,
  STRATEGIES,
  type Coverage,
  type DataStrategy,
  type MemberDraft,
  type MockNode,
  type PresetId,
} from '@/lib/distributedMock'

const props = defineProps<{ modelValue: MemberDraft[]; preset: PresetId }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: MemberDraft[]): void }>()

const strategyOptions = STRATEGIES.map(({ value, label }) => ({ value, label }))
const coverageOptions = COVERAGES.map(({ value, label }) => ({ value, label }))

const memberOf = (node: MockNode) => props.modelValue.find((member) => member.nodeId === node.id)
const eligible = (node: MockNode) => node.shardHost && node.reachable

function toggle(node: MockNode, on: boolean) {
  if (!on) return emit('update:modelValue', props.modelValue.filter((member) => member.nodeId !== node.id))
  const sharded = props.preset.startsWith('sharding')
  const added: MemberDraft = { nodeId: node.id, strategy: 'copy', coverage: sharded ? 'assigned' : 'all' }
  emit('update:modelValue', [...props.modelValue, added])
}

function change(node: MockNode, patch: Partial<{ strategy: DataStrategy; coverage: Coverage }>) {
  emit('update:modelValue', props.modelValue.map((member) => (member.nodeId === node.id ? { ...member, ...patch } : member)))
}
</script>

<template>
  <div class="overflow-x-auto rounded-md border border-border">
    <table class="w-full min-w-[56rem] text-left text-xs">
      <thead class="border-b border-border bg-muted/40 text-muted-foreground">
        <tr>
          <th class="w-10 px-3 py-2"><span class="sr-only">Member</span></th>
          <th class="px-3 py-2 font-medium">Node</th>
          <th class="px-3 py-2 font-medium">Location</th>
          <th class="px-3 py-2 font-medium">Operator label</th>
          <th class="px-3 py-2 font-medium">Free space</th>
          <th class="px-3 py-2 font-medium">Role</th>
          <th class="w-40 px-3 py-2 font-medium">Data strategy</th>
          <th class="w-36 px-3 py-2 font-medium">Metadata coverage</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border">
        <tr v-for="node in MOCK_NODES" :key="node.id" :class="eligible(node) ? '' : 'text-muted-foreground'">
          <td class="px-3 py-2">
            <input
              type="checkbox"
              :checked="Boolean(memberOf(node))"
              :disabled="!eligible(node)"
              :aria-label="`Use ${node.id} as a member`"
              @change="toggle(node, ($event.target as HTMLInputElement).checked)"
            />
          </td>
          <td class="px-3 py-2 font-medium"><NodeLabel :node-id="node.id" /></td>
          <td class="px-3 py-2">{{ node.location }}</td>
          <td class="px-3 py-2">
            <Badge v-if="node.shardHost" variant="success" size="sm" class="font-mono">{{ SHARD_HOST_LABEL }}</Badge>
            <span v-else :title="`An operator sets ${SHARD_HOST_LABEL} to allow this node.`">
              <span class="font-mono">{{ SHARD_HOST_LABEL }}</span> is not set
            </span>
          </td>
          <td class="px-3 py-2">{{ node.freePercent }} %</td>
          <td class="px-3 py-2">
            <template v-if="memberOf(node)">
              {{ roleLabel(preset, modelValue.indexOf(memberOf(node)!), memberOf(node)!) }}
            </template>
          </td>
          <td class="px-3 py-2">
            <Select
              v-if="memberOf(node)"
              :model-value="memberOf(node)!.strategy"
              :options="strategyOptions"
              :aria-label="`Data strategy on ${node.id}`"
              @update:model-value="change(node, { strategy: $event as DataStrategy })"
            />
          </td>
          <td class="px-3 py-2">
            <Select
              v-if="memberOf(node)"
              :model-value="memberOf(node)!.coverage"
              :options="coverageOptions"
              :aria-label="`Metadata coverage on ${node.id}`"
              @update:model-value="change(node, { coverage: $event as Coverage })"
            />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
