<script setup lang="ts">
// Mock of one search that shows dataset hits and file hits together.
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import MockNotice from '@/components/distributed/MockNotice.vue'
import Badge from '@/components/ui/Badge.vue'
import Input from '@/components/ui/Input.vue'
import OptionToggle from '@/components/ui/OptionToggle.vue'
import { SEARCH_HITS, SEARCH_QUERY } from '@/lib/distributedMockData'
import { MOCK_BASE } from '@/router/distributedMock'
import { File, FolderTree } from '@lucide/vue'

const query = ref(SEARCH_QUERY)
const kind = ref('all')
const KINDS = [
  { value: 'all', label: 'Datasets and files' },
  { value: 'dataset', label: 'Datasets' },
  { value: 'file', label: 'Files' },
]

const hits = computed(() => SEARCH_HITS.filter((hit) => kind.value === 'all' || hit.kind === kind.value))
</script>

<template>
  <div>
    <PageHeader title="Search" description="Datasets and the files of distributed buckets in one list.">
      <template #breadcrumbs>
        <span>·</span>
        <RouterLink :to="MOCK_BASE" class="hover:underline">Distributed buckets</RouterLink>
      </template>
    </PageHeader>

    <div class="container space-y-4 py-6">
      <MockNotice />
      <div class="flex flex-wrap items-center gap-3">
        <Input v-model="query" class="max-w-md" aria-label="Search" />
        <OptionToggle v-model="kind" :options="KINDS" aria-label="Kind of result" />
      </div>
      <p class="text-xs text-muted-foreground">
        Searched the datasets of 3 nodes and the file name indexes of 51 ranges. The result is complete. Example hits, the query is not used.
      </p>
      <ul class="surface divide-y divide-border">
        <li v-for="hit in hits" :key="hit.title" class="flex items-start gap-3 px-4 py-3">
          <FolderTree v-if="hit.kind === 'dataset'" class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <File v-else class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div class="min-w-0 flex-1">
            <RouterLink
              v-if="hit.file"
              :to="{ path: `${MOCK_BASE}/${hit.where}/object`, query: { file: hit.file } }"
              class="break-all font-mono text-xs font-medium text-foreground hover:underline"
            >
              {{ hit.title }}
            </RouterLink>
            <span v-else :class="hit.kind === 'file' ? 'break-all font-mono text-xs' : 'text-sm'" class="font-medium text-foreground">{{ hit.title }}</span>
            <p class="mt-0.5 text-xs text-muted-foreground">{{ hit.relation }}</p>
          </div>
          <Badge :variant="hit.kind === 'dataset' ? 'royal' : 'outline'" size="sm">{{ hit.kind === 'dataset' ? 'Dataset' : 'File' }}</Badge>
          <span class="w-24 shrink-0 truncate text-right text-xs text-muted-foreground">{{ hit.where }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>
