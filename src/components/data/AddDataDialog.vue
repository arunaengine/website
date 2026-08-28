<script setup lang="ts">
import Tabs from '@/components/ui/Tabs.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import ConnectorDialog from '@/components/groups/ConnectorDialog.vue'
import AddDataShell from '@/components/data/add/AddDataShell.vue'
import UploadTab from '@/components/data/add/UploadTab.vue'
import ConnectorTab from '@/components/data/add/ConnectorTab.vue'
import OtherBucketsTab from '@/components/data/add/OtherBucketsTab.vue'
import { useConnectorSource, type ConnectorStagingRow } from '@/components/data/add/useConnectorSource'
import { useOtherBuckets } from '@/components/data/add/useOtherBuckets'
import { useBuilderBasket } from '@/composables/useBuilderBasket'
import type { StagingReferenceEntry } from '@/lib/api'
import { computed, ref, toRef } from 'vue'
import { Boxes, CloudDownload, Upload } from '@lucide/vue'

// The ONE "Add data" entry point: a basket dialog for local files/folders
// (persistent upload queue) and connector entries (batch staging), plus an
// "Other buckets" source that imports objects from any bucket in the realm
// through sync relationships (copy once or reference).
const props = defineProps<{
  open: boolean
  bucket: string
  prefix: string
  groupId: string | null
  /** Keys visible in the parent's current listing, for overwrite warnings. */
  existingKeys?: ReadonlySet<string>
  existingReferences?: readonly StagingReferenceEntry[]
}>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'staged'): void
  // A sync relationship was created from the Other buckets tab.
  (e: 'sync-created'): void
}>()

const existingKeys = computed<ReadonlySet<string>>(() => props.existingKeys ?? new Set())

const basket = useBuilderBasket({
  bucket: toRef(props, 'bucket'),
  prefix: toRef(props, 'prefix'),
  groupId: toRef(props, 'groupId'),
  existingKeys,
})

const connectorSource = useConnectorSource({
  open: toRef(props, 'open'),
  groupId: toRef(props, 'groupId'),
  prefix: toRef(props, 'prefix'),
  existingReferences: toRef(props, 'existingReferences'),
})

const otherBuckets = useOtherBuckets({
  open: toRef(props, 'open'),
  bucket: toRef(props, 'bucket'),
  prefix: toRef(props, 'prefix'),
})

const { groupSel, registerOpen, onConnectorSaved } = connectorSource

const tab = ref('local')

function addConnectorRows(rows: ConnectorStagingRow[]) {
  basket.addStaging('connector', rows)
}

function onImportsCreated() {
  emit('sync-created')
  emit('staged')
}
</script>

<template>
  <AddDataShell
    :open="props.open"
    :bucket="bucket"
    :prefix="prefix"
    :group-id="groupId"
    :basket="basket"
    :existing-keys="existingKeys"
    @update:open="(v: boolean) => emit('update:open', v)"
    @staged="emit('staged')"
  >
    <Tabs v-model="tab">
      <TabsList>
        <TabsTrigger value="local"><Upload class="mr-1 h-3.5 w-3.5" /> Local files</TabsTrigger>
        <TabsTrigger value="connector"><CloudDownload class="mr-1 h-3.5 w-3.5" /> From connector</TabsTrigger>
        <TabsTrigger value="other"><Boxes class="mr-1 h-3.5 w-3.5" /> Other buckets</TabsTrigger>
      </TabsList>

      <TabsContent value="local" class="space-y-3">
        <UploadTab @add="(files: File[]) => basket.addUploads(files)" />
      </TabsContent>

      <TabsContent value="connector" class="space-y-3">
        <ConnectorTab
          :source="connectorSource"
          @add="addConnectorRows"
          @navigate="emit('update:open', false)"
        />
      </TabsContent>

      <TabsContent value="other" class="space-y-3">
        <OtherBucketsTab
          :imports="otherBuckets"
          :bucket="bucket"
          :prefix="prefix"
          @created="onImportsCreated"
        />
      </TabsContent>
    </Tabs>

    <template #dialogs>
      <ConnectorDialog v-model:open="registerOpen" :group-id="groupSel" @saved="onConnectorSaved" />
    </template>
  </AddDataShell>
</template>
