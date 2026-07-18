<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Breadcrumbs from '@/components/data/Breadcrumbs.vue'
import ObjectIcon from '@/components/data/ObjectIcon.vue'
import { useS3, s3ErrorMessage, isS3AuthError, type BucketEntry, type FolderEntry, type ObjectEntry } from '@/composables/useS3'
import { formatBytes, relativeTime } from '@/lib/utils'
import { isWorkspaceBucket } from '@/lib/workspaces'
import { computed, ref, watch } from 'vue'
import { Boxes, Loader2 } from '@lucide/vue'

// Read-only bucket/object browser for picking an object (no uploads, deletes or
// routing — the Data Manager keeps its own richer inline browser). Emits
// `select` with the clicked object; the parent decides what to do with it.
const emit = defineEmits<{
  (e: 'select', entry: { bucket: string; key: string; name: string; size?: number }): void
  (e: 'auth-error'): void
}>()

const s3 = useS3()

const bucket = ref('')
const prefix = ref('')
const s3Prefix = computed(() => (prefix.value ? `${prefix.value}/` : ''))

const buckets = ref<BucketEntry[]>([])
const bucketsLoading = ref(false)
const bucketsError = ref<string | null>(null)

// Pickers never offer per-run ws-<jobId> scratch buckets.
const visibleBuckets = computed(() => buckets.value.filter((entry) => !isWorkspaceBucket(entry.name)))

const folders = ref<FolderEntry[]>([])
const objects = ref<ObjectEntry[]>([])
const nextToken = ref<string | undefined>(undefined)
const listLoading = ref(false)
const listError = ref<string | null>(null)

// Stale responses are dropped via a request id (same pattern as DataManagerView).
let bucketRequestId = 0
let listRequestId = 0

function clearObjects() {
  ++listRequestId
  folders.value = []
  objects.value = []
  nextToken.value = undefined
  listLoading.value = false
  listError.value = null
}

async function refreshBuckets() {
  if (!s3.hasActiveKey.value || !s3.endpoint.value) return
  const requestId = ++bucketRequestId
  bucketsLoading.value = true
  bucketsError.value = null
  try {
    const entries = await s3.listBuckets()
    if (requestId !== bucketRequestId) return
    buckets.value = entries
  } catch (err) {
    if (requestId === bucketRequestId) {
      bucketsError.value = s3ErrorMessage(err)
      buckets.value = []
      if (isS3AuthError(err)) emit('auth-error')
    }
  } finally {
    if (requestId === bucketRequestId) bucketsLoading.value = false
  }
}

async function loadObjects(more = false) {
  if (!s3.hasActiveKey.value || !s3.endpoint.value || !bucket.value) return
  const requestId = ++listRequestId
  const targetBucket = bucket.value
  const targetPrefix = s3Prefix.value
  const continuation = more ? nextToken.value : undefined
  listLoading.value = true
  listError.value = null
  try {
    const page = await s3.listObjects(targetBucket, targetPrefix, continuation)
    if (requestId !== listRequestId) return
    folders.value = more ? [...folders.value, ...page.folders] : page.folders
    objects.value = more ? [...objects.value, ...page.objects] : page.objects
    nextToken.value = page.nextToken
  } catch (err) {
    if (requestId === listRequestId) {
      listError.value = s3ErrorMessage(err)
      if (isS3AuthError(err)) emit('auth-error')
    }
  } finally {
    if (requestId === listRequestId) listLoading.value = false
  }
}

watch(
  [() => s3.activeKey.value, () => s3.endpoint.value],
  ([key, endpoint]) => {
    ++bucketRequestId
    buckets.value = []
    bucketsLoading.value = false
    bucketsError.value = null
    clearObjects()
    if (!key || !endpoint) {
      return
    }
    void refreshBuckets()
    if (bucket.value) void loadObjects()
  },
  { immediate: true },
)

function openBucket(name: string) {
  clearObjects()
  bucket.value = name
  prefix.value = ''
  void loadObjects()
}

function navigateTo(path: string) {
  clearObjects()
  prefix.value = path
  void loadObjects()
}

function openFolder(folder: FolderEntry) {
  navigateTo(folder.prefix.replace(/\/$/, ''))
}

function pick(object: ObjectEntry) {
  emit('select', { bucket: bucket.value, key: object.key, name: object.name, size: object.size })
}

const isEmpty = computed(
  () => !listLoading.value && !listError.value && !folders.value.length && !objects.value.length,
)
</script>

<template>
  <div class="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
    <aside class="overflow-hidden rounded-md border border-border">
      <header class="flex items-center justify-between border-b border-border px-3 py-2">
        <span class="text-xs font-semibold text-foreground">Buckets</span>
        <Badge variant="outline">{{ visibleBuckets.length }}</Badge>
      </header>
      <div v-if="bucketsLoading" class="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
        <Loader2 class="h-3.5 w-3.5 animate-spin" /> Loading…
      </div>
      <p v-else-if="bucketsError" class="px-3 py-2 text-xs text-destructive">{{ bucketsError }}</p>
      <ul v-else-if="visibleBuckets.length" class="max-h-[260px] overflow-y-auto py-1">
        <li v-for="entry in visibleBuckets" :key="entry.name">
          <button
            type="button"
            class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted"
            :class="entry.name === bucket ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'"
            @click="openBucket(entry.name)"
          >
            <Boxes class="h-3.5 w-3.5 shrink-0 text-primary" />
            <span class="truncate">{{ entry.name }}</span>
          </button>
        </li>
      </ul>
      <p v-else class="px-3 py-3 text-xs text-muted-foreground">No buckets in this group yet.</p>
    </aside>

    <div class="min-w-0">
      <div v-if="!bucket" class="grid h-full min-h-[160px] place-items-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
        Select a bucket to browse its objects.
      </div>
      <template v-else>
        <div class="flex min-w-0 items-center gap-2 pb-2">
          <Breadcrumbs :bucket="bucket" :path="prefix" @navigate="navigateTo" />
          <Loader2 v-if="listLoading" class="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        </div>
        <div class="overflow-hidden rounded-md border border-border">
          <p v-if="listError" class="border-b border-border px-3 py-2 text-xs text-destructive">{{ listError }}</p>
          <div class="max-h-[260px] overflow-y-auto">
            <table class="w-full text-sm">
              <thead class="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th class="px-3 py-1.5 text-left font-semibold">Name</th>
                  <th class="px-3 py-1.5 text-right font-semibold">Size</th>
                  <th class="px-3 py-1.5 text-left font-semibold">Modified</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="folder in folders"
                  :key="folder.prefix"
                  class="cursor-pointer border-t border-border hover:bg-muted/50"
                  @click="openFolder(folder)"
                >
                  <td class="px-3 py-2">
                    <span class="flex items-center gap-2 text-xs"><ObjectIcon :name="folder.name" folder class="h-4 w-4" /> {{ folder.name }}/</span>
                  </td>
                  <td class="px-3 py-2 text-right text-xs text-muted-foreground">—</td>
                  <td class="px-3 py-2 text-xs text-muted-foreground">—</td>
                </tr>
                <tr
                  v-for="object in objects"
                  :key="object.key"
                  class="cursor-pointer border-t border-border hover:bg-muted/30"
                  @click="pick(object)"
                >
                  <td class="px-3 py-2">
                    <span class="flex items-center gap-2 text-xs"><ObjectIcon :name="object.name" class="h-4 w-4" /> <span class="truncate">{{ object.name }}</span></span>
                  </td>
                  <td class="px-3 py-2 text-right font-mono text-xs text-muted-foreground">{{ object.size !== undefined ? formatBytes(object.size) : '—' }}</td>
                  <td class="px-3 py-2 text-xs text-muted-foreground">{{ object.lastModified ? relativeTime(object.lastModified.toISOString()) : '—' }}</td>
                </tr>
                <tr v-if="isEmpty">
                  <td colspan="3" class="px-3 py-6 text-center text-xs text-muted-foreground">This prefix is empty.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="nextToken" class="border-t border-border px-3 py-1.5">
            <Button variant="ghost" size="sm" :disabled="listLoading" @click="loadObjects(true)">Load more</Button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
