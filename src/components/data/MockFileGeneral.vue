<script setup lang="ts">
// What file details show for an example file: the file, where it came from, what it is part of.
// The ids, the full origin and the dataset entries wait in the collapsed Details.
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import DatasetOrigin from '@/components/data/DatasetOrigin.vue'
import OriginLine from '@/components/data/OriginLine.vue'
import GlobalId from '@/components/distributed/GlobalId.vue'
import RowList from '@/components/distributed/RowList.vue'
import Button from '@/components/ui/Button.vue'
import { useMockDatabases } from '@/composables/useMockDatabases'
import { REALM_ID } from '@/lib/distributedMock'
import { originOf, type MockObject } from '@/lib/distributedMockData'
import { copyToClipboard, formatBytes, relativeTime } from '@/lib/utils'

const props = defineProps<{ object: MockObject }>()

const { partOf } = useMockDatabases()
const parts = computed(() => partOf(props.object.bucket, props.object.key))
// A file can be part of many datasets, so a few show first.
const LIMIT = 3
const more = ref(false)
const shownParts = computed(() => (more.value ? parts.value : parts.value.slice(0, LIMIT)))
const copied = ref(false)
const rows = computed(() => [
  { label: 'Key', value: props.object.key, mono: true },
  { label: 'Size', value: formatBytes(props.object.size) },
  { label: 'Modified', value: relativeTime(props.object.modified) },
])

async function copyId() {
  await copyToClipboard(`https://w3id.org/aruna/data/${REALM_ID}/${props.object.versionId}`)
  copied.value = true
}
</script>

<template>
  <div class="space-y-5">
    <section class="space-y-2">
      <h3 class="text-sm font-medium text-foreground">File</h3>
      <RowList :rows="rows" />
    </section>
    <section class="space-y-2 border-t border-border pt-4">
      <h3 class="text-sm font-medium text-foreground">Origin</h3>
      <div class="text-xs"><OriginLine short :origin="originOf(object)" /></div>
    </section>
    <section v-if="parts.length" class="space-y-2 border-t border-border pt-4">
      <h3 class="text-sm font-medium text-foreground">Part of</h3>
      <ul class="space-y-1 text-xs">
        <li v-for="item in shownParts" :key="item.dataset.id">
          <RouterLink :to="{ name: 'dataset', params: { id: item.dataset.id } }" class="font-medium text-primary hover:underline">{{ item.dataset.name }}</RouterLink>
          <span v-if="item.database" class="text-muted-foreground"> · database</span>
        </li>
      </ul>
      <button v-if="parts.length > LIMIT" type="button" class="text-xs text-primary hover:underline" @click="more = !more">
        {{ more ? 'Show fewer' : `${parts.length - LIMIT} more` }}
      </button>
    </section>
    <div class="flex items-center gap-2 border-t border-border pt-4">
      <Button size="sm" variant="outline" @click="copyId">{{ copied ? 'Copied' : 'Copy id' }}</Button>
    </div>
    <details class="border-t border-border pt-3 text-xs">
      <summary class="cursor-pointer text-sm font-medium text-foreground">Details</summary>
      <div class="mt-3 space-y-4">
        <div>
          <p class="mb-1 text-muted-foreground">Origin</p>
          <OriginLine :origin="originOf(object)" />
        </div>
        <div>
          <p class="mb-1 text-muted-foreground">Ids</p>
          <GlobalId :version-id="object.versionId" :content-hash="object.contentHash" />
        </div>
        <div>
          <p class="mb-1 text-muted-foreground">Added to datasets as</p>
          <DatasetOrigin :key="object.versionId" :origin="originOf(object)" :part-of="parts" />
        </div>
      </div>
    </details>
  </div>
</template>
