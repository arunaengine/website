<script setup lang="ts">
// Who may use the bucket, and on which nodes. Grants on single nodes get a warning.
import { computed } from 'vue'
import PermissionNotice from '@/components/distributed/PermissionNotice.vue'
import Badge from '@/components/ui/Badge.vue'
import { GROUP_ID, grantGap, REALM_ID } from '@/lib/distributedMock'
import { MOCK_GRANTS } from '@/lib/distributedMockData'
import { type DistributedBucket } from '@/lib/distribution'

const props = defineProps<{ bucket: DistributedBucket }>()

const rows = computed(() => {
  const ids = props.bucket.members.map((member) => member.nodeId)
  return (MOCK_GRANTS[props.bucket.name] ?? []).map((grant) => ({
    ...grant,
    paths: grant.nodes.map((node) => `/${REALM_ID}/g/${GROUP_ID}/data/${node}/${props.bucket.name}/**`),
    missing: grantGap(grant.nodes, ids),
  }))
})
</script>

<template>
  <div class="surface space-y-4 p-5">
    <PermissionNotice v-for="row in rows.filter((item) => item.missing.length)" :key="row.holder" :holder="row.holder" :bucket="bucket.name" :missing="row.missing" />
    <div class="overflow-x-auto rounded-md border border-border">
      <table class="w-full min-w-[44rem] text-left text-xs">
        <thead class="border-b border-border bg-muted/40 text-muted-foreground">
          <tr>
            <th class="px-3 py-2 font-medium">Holder</th>
            <th class="px-3 py-2 font-medium">Role</th>
            <th class="px-3 py-2 font-medium">Path</th>
            <th class="px-3 py-2 font-medium">Nodes covered</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          <tr v-for="row in rows" :key="row.holder">
            <td class="px-3 py-2"><span class="font-medium text-foreground">{{ row.holder }}</span> <span class="text-muted-foreground">{{ row.kind.toLowerCase() }}</span></td>
            <td class="px-3 py-2">{{ row.role }}</td>
            <td class="px-3 py-2"><p v-for="path in row.paths" :key="path" class="break-all font-mono text-[11px]">{{ path }}</p></td>
            <td class="px-3 py-2">
              <Badge v-if="row.missing.length" variant="warn" size="sm">{{ bucket.members.length - row.missing.length }} of {{ bucket.members.length }}</Badge>
              <Badge v-else variant="success" size="sm">All {{ bucket.members.length }}</Badge>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
