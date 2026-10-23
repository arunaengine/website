<script setup lang="ts">
// The file list of an example bucket that is stored on several nodes.
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import DegradedNotice from '@/components/distributed/DegradedNotice.vue'
import MockNotice from '@/components/distributed/MockNotice.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { storedLabel } from '@/lib/distributedMock'
import { bucketFiles, degradedRanges, type MockBucket } from '@/lib/distributedMockData'
import { formatBytes } from '@/lib/utils'
import { Boxes, Plus, Settings } from '@lucide/vue'

const props = defineProps<{ bucket: MockBucket }>()
const emit = defineEmits<{ (e: 'add-data'): void; (e: 'open', key: string): void }>()

const files = computed(() => bucketFiles(props.bucket.name))
const degraded = computed(() => degradedRanges(props.bucket))
</script>

<template>
  <section class="surface min-w-0 space-y-4 p-4">
    <header class="flex flex-wrap items-center gap-3">
      <Boxes class="size-4 text-primary" />
      <h2 class="font-mono text-sm font-medium text-foreground">{{ bucket.name }}</h2>
      <Badge variant="outline" size="sm">{{ storedLabel(bucket.preset, bucket.members.length) }}</Badge>
      <Badge v-if="degraded.length" variant="warn" size="sm">Degraded</Badge>
      <div class="ml-auto flex gap-2">
        <Button variant="outline" size="sm" as-child>
          <RouterLink :to="{ name: 'bucket-storage', params: { bucketId: bucket.name } }"><Settings class="size-3.5" /> Bucket settings</RouterLink>
        </Button>
        <Button size="sm" @click="emit('add-data')"><Plus class="size-3.5" /> Add data</Button>
      </div>
    </header>
    <MockNotice />
    <DegradedNotice v-for="range in degraded" :key="range.id" :range="range" />
    <ul v-if="files.length" class="divide-y divide-border rounded-md border border-border">
      <li v-for="file in files" :key="file.id">
        <button type="button" class="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left hover:bg-muted/40" @click="emit('open', file.key)">
          <span class="min-w-0 flex-1 break-all font-mono text-xs">{{ file.key }}</span>
          <Badge v-if="file.external?.notPinned" variant="warn" size="sm">Not pinned</Badge>
          <Badge v-else-if="file.external" variant="outline" size="sm">From a source</Badge>
          <span class="text-xs text-muted-foreground">{{ formatBytes(file.size) }}</span>
        </button>
      </li>
    </ul>
    <EmptyState v-else title="No example files" description="This example bucket has no file pages in the mock." />
  </section>
</template>
