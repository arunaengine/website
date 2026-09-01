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
import { externalContentReference, type ContentIdentityOptions } from '@/lib/contentIdentity'
import { dataEntityIdentity, objectLocation } from '@/lib/crate/dataIdentity'
import {
  addFilePart,
  addSubcratePart,
  linkReference,
  type FilePart,
  type ReferenceTarget,
} from '@/lib/crate/references'
import {
  displayName,
  findEntity,
  isDataType,
  orderedEntities,
  rootId,
  typeLabel,
  type CrateDraft,
  type DraftEntity,
} from '@/lib/crate/editor'
import { isAbsoluteUri } from '@/lib/profiles/uri'
import type { MetadataDocumentListItem } from '@/lib/api'
import { formatBytes } from '@/lib/utils'
import { FileJson2 } from '@lucide/vue'

// The data entity picker: every source that can become a part, writing into
// the one property that asked for it.
const props = defineProps<{
  open: boolean
  draft: CrateDraft
  target: ReferenceTarget
  groupId?: string
}>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'update', draft: CrateDraft): void
}>()

const { apiBaseUrl, authToken, nodeInfo } = useAruna()
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
const query = ref('')
const url = ref('')
const urlName = ref('')

const uploads = computed(() => queue.items.value.filter((item) => uploading.value.includes(item.id)))
const targetEntity = computed(() => findEntity(props.draft, props.target.entityId))
const targetName = computed(() =>
  (props.target.entityId === rootId(props.draft) ? '' : displayName(targetEntity.value)))
const held = computed(() => new Set((targetEntity.value?.properties[props.target.property] ?? [])
  .filter((value) => value.kind === 'reference')
  .map((value) => value.value)))

// Everything already here that is not the target itself: data entities first,
// the rest still reachable because a parts list accepts any entity.
const listed = computed(() => {
  const text = query.value.trim().toLowerCase()
  const candidates = orderedEntities(props.draft).filter((entity) => {
    if (entity.id === props.target.entityId || entity.id === rootId(props.draft)) return false
    if (held.value.has(entity.id)) return false
    if (!text) return true
    return `${displayName(entity)} ${entity.id} ${entity.types.join(' ')}`.toLowerCase().includes(text)
  })
  return [
    ...candidates.filter((entity) => entity.types.some(isDataType)),
    ...candidates.filter((entity) => !entity.types.some(isDataType)),
  ]
})
const urlInvalid = computed(() => Boolean(url.value.trim()) && !isAbsoluteUri(url.value.trim()))

watch(() => props.open, (open) => {
  if (!open) return
  tab.value = 'bucket'
  prefix.value = ''
  query.value = ''
  url.value = ''
  urlName.value = ''
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

// What the node needs to answer with a content identity; without it the
// location stays the identity.
function identityOptions(): ContentIdentityOptions {
  return {
    realmId: nodeInfo.value?.node.realm_id ?? null,
    nodeId: nodeInfo.value?.node.peer_id ?? null,
    apiBaseUrl: apiBaseUrl.value,
    authToken: authToken.value ?? null,
    getVersionId: async (name: string, key: string) => (await s3.headObject(name, key)).versionId ?? null,
  }
}

async function filePart(bucketName: string, key: string, name: string, size?: number): Promise<FilePart> {
  const identity = await dataEntityIdentity(bucketName, key, identityOptions())
  return {
    id: identity.id,
    name,
    contentUrl: identity.contentUrl,
    ...(formatOf(name) ? { encodingFormat: formatOf(name) } : {}),
    ...(size === undefined ? {} : { contentSize: String(size) }),
  }
}

function apply(parts: FilePart[]) {
  let next = props.draft
  for (const part of parts) next = addFilePart(next, part, props.target)
  emit('update', next)
}

async function addObjects(selection: { bucket: string; objects: ObjectEntry[]; folders: FolderEntry[] }) {
  const parts: FilePart[] = []
  for (const object of selection.objects) {
    parts.push(await filePart(selection.bucket, object.key, object.name, object.size))
  }
  for (const folder of selection.folders) {
    const location = objectLocation(selection.bucket, folder.prefix)
    parts.push({ id: location, name: folder.name, type: 'Dataset', contentUrl: location })
  }
  apply(parts)
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
watch(uploads, (items) => void linkUploads(items), { deep: true })

async function linkUploads(items: Array<{ id: number; bucket: string; key: string; name: string; size: number; state: string }>) {
  const ready = items.filter((item) => item.state === 'done' && !linked.value.has(item.id))
  if (!ready.length) return
  const parts: FilePart[] = []
  for (const item of ready) {
    linked.value.add(item.id)
    parts.push(await filePart(item.bucket, item.key, item.name, item.size))
  }
  apply(parts)
}

function addDatasets(items: MetadataDocumentListItem[]) {
  let next = props.draft
  for (const item of items) {
    if (!item.graph_iri) continue
    next = addSubcratePart(next, {
      iri: item.graph_iri,
      name: item.document_path,
      identifier: item.document_id,
      subjectOf: `${apiBaseUrl.value.replace(/\/+$/, '')}/metadata/${encodeURIComponent(item.document_id)}/rocrate`,
    }, props.target)
  }
  datasetsOpen.value = false
  emit('update', next)
}

function linkExisting(entity: DraftEntity) {
  emit('update', linkReference(props.draft, props.target.entityId, props.target.property, entity.id))
}

function addUrl() {
  const value = url.value.trim()
  if (!value || urlInvalid.value) return
  const reference = externalContentReference(value)
  const name = urlName.value.trim() || value
  url.value = ''
  urlName.value = ''
  apply([{ id: reference.id, name }])
}
</script>

<template>
  <Dialog :open="open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogContent class="max-w-3xl">
      <DialogHeader>
        <DialogTitle>Add files</DialogTitle>
        <DialogDescription>
          Reference objects stored in a bucket, upload new ones, link another dataset, or point at
          something already here. Everything added becomes a part of
          {{ targetName ? targetName : 'this dataset' }}.
        </DialogDescription>
      </DialogHeader>

      <Tabs v-model="tab">
        <TabsList>
          <TabsTrigger value="bucket">From a bucket</TabsTrigger>
          <TabsTrigger value="upload">Upload to a bucket</TabsTrigger>
          <TabsTrigger value="dataset">Another dataset</TabsTrigger>
          <TabsTrigger value="crate">In this dataset</TabsTrigger>
          <TabsTrigger value="url">External URL</TabsTrigger>
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

        <TabsContent value="crate" class="space-y-2">
          <Input v-model="query" aria-label="Search this dataset" placeholder="Search this dataset" />
          <ul v-if="listed.length" class="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border">
            <li v-for="entity in listed" :key="entity.id">
              <button
                type="button"
                class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/40"
                @click="linkExisting(entity)"
              >
                <span class="min-w-0 flex-1 truncate font-medium text-foreground">{{ displayName(entity) }}</span>
                <span class="shrink-0 text-muted-foreground">{{ entity.types.map(typeLabel).join(', ') }}</span>
              </button>
            </li>
          </ul>
          <p v-else class="px-1 py-2 text-xs text-muted-foreground">
            Nothing else in this dataset can be added here yet.
          </p>
        </TabsContent>

        <TabsContent value="url" class="space-y-3">
          <p class="text-xs text-muted-foreground">
            A file that lives outside this node stays where it is; only its address is recorded.
          </p>
          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label class="text-xs font-medium text-foreground">Address</label>
              <Input
                v-model="url"
                class="mt-1"
                aria-label="External URL"
                placeholder="https://example.org/reads.fastq.gz"
                :invalid="urlInvalid ? 'error' : undefined"
                @keydown.enter="addUrl"
              />
            </div>
            <div>
              <label class="text-xs font-medium text-foreground">Name</label>
              <Input v-model="urlName" class="mt-1" aria-label="External file name" placeholder="Optional" />
            </div>
          </div>
          <p v-if="urlInvalid" class="text-[11px] text-destructive">That is not an absolute URL.</p>
          <Button size="sm" :disabled="!url.trim() || urlInvalid" @click="addUrl">Add file</Button>
        </TabsContent>
      </Tabs>

      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">Done</Button>
      </DialogFooter>

      <SubcratePickerDialog
        v-model:open="datasetsOpen"
        :excluded-iris="[...held]"
        @select="addDatasets"
      />
    </DialogContent>
  </Dialog>
</template>
