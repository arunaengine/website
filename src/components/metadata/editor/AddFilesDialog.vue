<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Progress from '@/components/ui/Progress.vue'
import Select from '@/components/ui/Select.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import ObjectBrowserPanel from '@/components/data/ObjectBrowserPanel.vue'
import UploadTab from '@/components/data/add/UploadTab.vue'
import SubcratePickerDialog from '@/components/metadata/SubcratePickerDialog.vue'
import { useAruna } from '@/composables/useAruna'
import { useS3, s3ErrorMessage, type FolderEntry, type ObjectEntry } from '@/composables/useS3'
import { useUploadQueue } from '@/composables/useUploadQueue'
import { addFilePart, addSubcratePart, partIds, type CrateDraft } from '@/lib/crate/editor'
import type { MetadataDocumentListItem } from '@/lib/api'
import { formatBytes } from '@/lib/utils'
import { FileJson2 } from '@lucide/vue'

const props = defineProps<{ open: boolean; draft: CrateDraft; groupId?: string }>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'update', draft: CrateDraft): void
}>()

const { apiBaseUrl } = useAruna()
const s3 = useS3()
const queue = useUploadQueue()

const FORMATS: Readonly<Record<string, string>> = {
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  json: 'application/json',
  jsonld: 'application/ld+json',
  txt: 'text/plain',
  md: 'text/markdown',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  zip: 'application/zip',
  gz: 'application/gzip',
  parquet: 'application/vnd.apache.parquet',
}

const tab = ref('bucket')
const bucket = ref('')
const prefix = ref('')
const buckets = ref<Array<{ value: string; label: string }>>([])
const bucketError = ref('')
const uploading = ref<number[]>([])
const linked = ref(new Set<number>())
const datasetsOpen = ref(false)

const uploads = computed(() => queue.items.value.filter((item) => uploading.value.includes(item.id)))

watch(() => props.open, (open) => {
  if (!open) return
  tab.value = 'bucket'
  prefix.value = ''
  uploading.value = []
  linked.value = new Set()
  void loadBuckets()
}, { immediate: true })

async function loadBuckets() {
  bucketError.value = ''
  try {
    const entries = await s3.listBuckets()
    buckets.value = entries.map((entry) => ({ value: entry.name, label: entry.name }))
    bucket.value = buckets.value[0]?.value ?? ''
  } catch (error) {
    bucketError.value = s3ErrorMessage(error)
  }
}

function formatOf(name: string): string | undefined {
  return FORMATS[name.split('.').pop()?.toLowerCase() ?? '']
}

function addObjects(selection: { bucket: string; objects: ObjectEntry[]; folders: FolderEntry[] }) {
  let next = props.draft
  for (const object of selection.objects) {
    const location = `s3://${selection.bucket}/${object.key}`
    next = addFilePart(next, {
      id: location,
      name: object.name,
      contentUrl: location,
      ...(formatOf(object.name) ? { encodingFormat: formatOf(object.name) } : {}),
      ...(object.size === undefined ? {} : { contentSize: String(object.size) }),
    })
  }
  for (const folder of selection.folders) {
    const location = `s3://${selection.bucket}/${folder.prefix}`
    next = addFilePart(next, { id: location, name: folder.name, type: 'Dataset', contentUrl: location })
  }
  emit('update', next)
}

function upload(files: File[]) {
  if (!bucket.value) return
  const known = new Set(queue.items.value.map((item) => item.id))
  const target = prefix.value.trim() ? `${prefix.value.trim().replace(/\/+$/, '')}/` : ''
  queue.enqueue(files, {
    bucket: bucket.value,
    prefix: target,
    groupId: s3.activeContext.value?.groupId ?? props.groupId ?? null,
  })
  uploading.value = [
    ...uploading.value,
    ...queue.items.value.filter((item) => !known.has(item.id)).map((item) => item.id),
  ]
}

// An upload becomes a part only once the object exists on the node.
watch(uploads, (items) => {
  let next = props.draft
  let changed = false
  for (const item of items) {
    if (item.state !== 'done' || linked.value.has(item.id)) continue
    linked.value.add(item.id)
    const location = `s3://${item.bucket}/${item.key}`
    if (partIds(next).has(location)) continue
    changed = true
    next = addFilePart(next, {
      id: location,
      name: item.name,
      contentUrl: location,
      ...(formatOf(item.name) ? { encodingFormat: formatOf(item.name) } : {}),
      contentSize: String(item.size),
    })
  }
  if (changed) emit('update', next)
}, { deep: true })

function addDatasets(items: MetadataDocumentListItem[]) {
  let next = props.draft
  for (const item of items) {
    if (!item.graph_iri) continue
    next = addSubcratePart(next, {
      iri: item.graph_iri,
      name: item.document_path,
      identifier: item.document_id,
      subjectOf: `${apiBaseUrl.value.replace(/\/+$/, '')}/metadata/${encodeURIComponent(item.document_id)}/rocrate`,
    })
  }
  datasetsOpen.value = false
  emit('update', next)
}
</script>

<template>
  <Dialog :open="open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogContent class="max-w-3xl">
      <DialogHeader>
        <DialogTitle>Add files</DialogTitle>
        <DialogDescription>
          Reference objects stored in a bucket, upload new ones, or link another dataset. Everything
          added here becomes a part of this dataset.
        </DialogDescription>
      </DialogHeader>

      <Tabs v-model="tab">
        <TabsList>
          <TabsTrigger value="bucket">From a bucket</TabsTrigger>
          <TabsTrigger value="upload">Upload to a bucket</TabsTrigger>
          <TabsTrigger value="dataset">Another dataset</TabsTrigger>
        </TabsList>

        <TabsContent value="bucket">
          <ObjectBrowserPanel selectable @add="addObjects" />
        </TabsContent>

        <TabsContent value="upload" class="space-y-3">
          <Notice v-if="bucketError" tone="warning">{{ bucketError }}</Notice>
          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label class="text-xs font-medium text-foreground">Bucket</label>
              <Select
                :model-value="bucket"
                :options="buckets"
                class="mt-1"
                placeholder="Choose a bucket"
                aria-label="Upload bucket"
                @update:model-value="(value: string) => (bucket = value)"
              />
            </div>
            <div>
              <label class="text-xs font-medium text-foreground">Folder</label>
              <Input v-model="prefix" class="mt-1" aria-label="Upload folder" placeholder="raw/reads" />
            </div>
          </div>
          <UploadTab @add="upload" />
          <ul v-if="uploads.length" class="divide-y divide-border rounded-md border border-border">
            <li v-for="item in uploads" :key="item.id" class="space-y-1 px-3 py-2">
              <div class="flex items-center gap-2 text-xs">
                <span class="min-w-0 flex-1 truncate text-foreground">{{ item.name }}</span>
                <span class="text-muted-foreground">{{ formatBytes(item.size) }}</span>
                <span class="text-muted-foreground">{{ item.state }}</span>
              </div>
              <Progress v-if="item.state === 'uploading'" :value="item.progress" />
              <p v-if="item.error" class="text-[11px] text-destructive">{{ item.error }}</p>
            </li>
          </ul>
        </TabsContent>

        <TabsContent value="dataset" class="space-y-3">
          <p class="text-xs text-muted-foreground">
            A linked dataset is referenced as its own RO-Crate, not copied into this one.
          </p>
          <Button variant="outline" size="sm" @click="datasetsOpen = true">
            <FileJson2 class="h-3.5 w-3.5" /> Choose a dataset
          </Button>
        </TabsContent>
      </Tabs>

      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">Done</Button>
      </DialogFooter>

      <SubcratePickerDialog
        v-model:open="datasetsOpen"
        :excluded-iris="[...partIds(draft)]"
        @select="addDatasets"
      />
    </DialogContent>
  </Dialog>
</template>
