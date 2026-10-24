<script setup lang="ts">
// Choose the nodes with their location and use. Only reachable infrastructure nodes can hold a bucket.
import Badge from '@/components/ui/Badge.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import { useRealmNodes, type RealmNodeDisplay } from '@/composables/useRealmNodes'
import { membersFor, type MemberDraft, type PresetId } from '@/lib/distributedMock'
import { formatBytes } from '@/lib/utils'

const props = defineProps<{ modelValue: MemberDraft[]; preset: PresetId }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: MemberDraft[]): void }>()

const { nodes } = useRealmNodes()

// Devices cannot hold a bucket.
const infrastructure = () => nodes.value.filter((node) => node.kind !== 'user')
const memberOf = (node: RealmNodeDisplay) => props.modelValue.find((member) => member.nodeId === node.nodeId)

function toggle(node: RealmNodeDisplay, on: boolean) {
  const chosen = props.modelValue.map((member) => member.nodeId).filter((id) => id !== node.nodeId)
  const ids = on ? [...chosen, node.nodeId] : chosen
  // The roles of the preset follow the order of the chosen nodes; later nodes keep copies.
  const roles = membersFor(props.preset, ids)
  const extra = ids.slice(roles.length).map((nodeId) => ({ nodeId, strategy: 'copy' as const, coverage: props.preset.startsWith('sharding') ? ('assigned' as const) : ('all' as const) }))
  emit('update:modelValue', [...roles, ...extra])
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
          <th class="px-3 py-2 font-medium">State</th>
          <th class="px-3 py-2 font-medium">Used space</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border">
        <tr v-for="node in infrastructure()" :key="node.nodeId" :class="node.reachable ? '' : 'text-muted-foreground'">
          <td class="px-3 py-2">
            <input
              type="checkbox"
              :checked="Boolean(memberOf(node))"
              :disabled="!node.reachable"
              :aria-label="`Store on ${node.label}`"
              @change="toggle(node, ($event.target as HTMLInputElement).checked)"
            />
          </td>
          <td class="px-3 py-2 font-medium"><NodeLabel :node-id="node.nodeId" /></td>
          <td class="px-3 py-2">{{ node.location ?? 'Not set' }}</td>
          <td class="px-3 py-2">
            <Badge :variant="node.reachable ? 'success' : 'warn'" size="sm">{{ node.reachable ? 'reachable' : 'not reachable' }}</Badge>
          </td>
          <td class="px-3 py-2">{{ node.info ? formatBytes(node.info.utilization.storage_bytes_used) : 'Unknown' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
