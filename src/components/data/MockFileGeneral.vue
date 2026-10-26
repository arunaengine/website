<script setup lang="ts">
// What file details show for an example file: the file and where it came from.
// The ids, the full origin and the dataset entries wait in the collapsed Details.
import { computed, ref } from 'vue'
import DatasetOrigin from '@/components/data/DatasetOrigin.vue'
import OriginLine from '@/components/data/OriginLine.vue'
import GlobalId from '@/components/distributed/GlobalId.vue'
import RowList from '@/components/distributed/RowList.vue'
import Button from '@/components/ui/Button.vue'
import { REALM_ID } from '@/lib/distributedMock'
import { originOf, type MockObject } from '@/lib/distributedMockData'
import { copyToClipboard, formatBytes, relativeTime } from '@/lib/utils'

const props = defineProps<{ object: MockObject }>()

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
          <DatasetOrigin :key="object.versionId" :origin="originOf(object)" />
        </div>
      </div>
    </details>
  </div>
</template>
