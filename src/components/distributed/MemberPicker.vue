<script setup lang="ts">
// Choose the nodes with their location and operator label. A node without the
// shard-host label cannot be chosen.
import Badge from '@/components/ui/Badge.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import { MOCK_NODES, SHARD_HOST_LABEL, type MemberDraft, type MockNode, type PresetId } from '@/lib/distributedMock'

const props = defineProps<{ modelValue: MemberDraft[]; preset: PresetId }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: MemberDraft[]): void }>()

const memberOf = (node: MockNode) => props.modelValue.find((member) => member.nodeId === node.id)
const eligible = (node: MockNode) => node.shardHost && node.reachable

function toggle(node: MockNode, on: boolean) {
  if (!on) return emit('update:modelValue', props.modelValue.filter((member) => member.nodeId !== node.id))
  const sharded = props.preset.startsWith('sharding')
  const added: MemberDraft = { nodeId: node.id, strategy: 'copy', coverage: sharded ? 'assigned' : 'all' }
  emit('update:modelValue', [...props.modelValue, added])
}
</script>

<template>
  <div class="overflow-x-auto rounded-md border border-border">
    <table class="w-full min-w-[36rem] text-left text-xs">
      <thead class="border-b border-border bg-muted/40 text-muted-foreground">
        <tr>
          <th class="w-10 px-3 py-2"><span class="sr-only">Member</span></th>
          <th class="px-3 py-2 font-medium">Node</th>
          <th class="px-3 py-2 font-medium">Location</th>
          <th class="px-3 py-2 font-medium">Operator label</th>
          <th class="px-3 py-2 font-medium">Free space</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border">
        <tr v-for="node in MOCK_NODES" :key="node.id" :class="eligible(node) ? '' : 'text-muted-foreground'">
          <td class="px-3 py-2">
            <input
              type="checkbox"
              :checked="Boolean(memberOf(node))"
              :disabled="!eligible(node)"
              :aria-label="`Store on ${node.id}`"
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
        </tr>
      </tbody>
    </table>
  </div>
</template>
