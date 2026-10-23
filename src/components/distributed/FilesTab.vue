<script setup lang="ts">
// A few example files. The real bucket opens in the normal file browser.
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { MOCK_OBJECTS } from '@/lib/distributedMockData'
import { formatBytes } from '@/lib/utils'
import { MOCK_BASE } from '@/router/distributedMock'

defineProps<{ bucket: string }>()
</script>

<template>
  <ul v-if="MOCK_OBJECTS.some((object) => object.bucket === bucket)" class="surface divide-y divide-border">
    <li v-for="object in MOCK_OBJECTS.filter((item) => item.bucket === bucket)" :key="object.id">
      <RouterLink
        :to="{ path: `${MOCK_BASE}/${bucket}/object`, query: { file: object.id } }"
        class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm hover:bg-muted/40"
      >
        <span class="min-w-0 flex-1 break-all font-mono text-xs">{{ object.key }}</span>
        <Badge v-if="object.external?.notPinned" variant="warn" size="sm">Not pinned</Badge>
        <Badge v-else-if="object.external" variant="outline" size="sm">External</Badge>
        <span class="text-xs text-muted-foreground">{{ formatBytes(object.size) }}</span>
      </RouterLink>
    </li>
  </ul>
  <EmptyState v-else title="No example files" description="This example bucket has no file pages in the mock." />
</template>
