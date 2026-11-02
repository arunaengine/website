<script setup lang="ts">
// Browses a bucket the user may read through the REST listing on the bucket's node, so buckets
// of other groups and nodes work without an S3 session. Picks keep the listed version.
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useAruna } from '@/composables/useAruna'
import type { ListedObject } from '@/lib/api'
import { errorMessage } from '@/lib/utils'
import { FileText, Folder } from '@lucide/vue'

export interface RemotePick {
  files: { key: string; versionId: string; name: string }[]
  folders: { prefix: string; name: string }[]
}

const props = defineProps<{ bucket: string; nodeId: string | null; busy?: boolean }>()
const emit = defineEmits<{ add: [pick: RemotePick] }>()

const { listBucketObjects } = useAruna()
const prefix = ref('')
// The start of a name in the open folder; the listing then holds only names that start with it.
const query = ref('')
const asked = ref('')
const objects = ref<ListedObject[]>([])
const prefixes = ref<string[]>([])
const cursor = ref<string | null>(null)
const loading = ref(false)
const failure = ref<string | null>(null)
const stale = ref(false)
const chosenFiles = ref(new Map<string, ListedObject>())
const chosenFolders = ref(new Set<string>())
let runs = 0

const tail = (path: string) => path.replace(/\/$/, '').split('/').pop() ?? path

async function load(more = false) {
  const run = ++runs
  loading.value = true
  failure.value = null
  try {
    const page = await listBucketObjects(props.bucket, { prefix: prefix.value + asked.value || undefined, delimiter: '/', cursor: more ? cursor.value ?? undefined : undefined }, props.nodeId)
    if (run !== runs) return
    // A folder's own empty marker object is the folder, not a file in it.
    const files = page.objects.filter((item) => !item.key.endsWith('/'))
    objects.value = more ? [...objects.value, ...files] : files
    prefixes.value = more ? [...prefixes.value, ...page.prefixes] : page.prefixes
    cursor.value = page.next_cursor ?? null
    stale.value = Boolean(page.stale_ranges?.length)
  } catch (cause) {
    if (run === runs) failure.value = errorMessage(cause)
  } finally {
    if (run === runs) loading.value = false
  }
}

// The rows and cursor of the folder before never show under the new one, also after a failure.
function open(next: string) {
  prefix.value = next
  query.value = ''
  find()
}
function find() {
  asked.value = query.value
  objects.value = []
  prefixes.value = []
  cursor.value = null
  void load()
}

watch(() => [props.bucket, props.nodeId], () => {
  chosenFiles.value = new Map()
  chosenFolders.value = new Set()
  open('')
}, { immediate: true })

const crumbs = computed(() => {
  const parts = prefix.value.split('/').filter(Boolean)
  return parts.map((part, index) => ({ name: part, prefix: `${parts.slice(0, index + 1).join('/')}/` }))
})
const count = computed(() => chosenFiles.value.size + chosenFolders.value.size)

function toggleFile(item: ListedObject) {
  const next = new Map(chosenFiles.value)
  if (next.has(item.key)) next.delete(item.key)
  else next.set(item.key, item)
  chosenFiles.value = next
}

function toggleFolder(path: string) {
  const next = new Set(chosenFolders.value)
  if (next.has(path)) next.delete(path)
  else next.add(path)
  chosenFolders.value = next
}

function add() {
  emit('add', {
    files: [...chosenFiles.value.values()].map((item) => ({ key: item.key, versionId: item.version_id, name: tail(item.key) })),
    folders: [...chosenFolders.value].map((path) => ({ prefix: path, name: tail(path) })),
  })
}
</script>

<template>
  <div class="space-y-2">
    <nav class="flex flex-wrap items-center gap-1 text-xs" aria-label="Folder">
      <button type="button" class="font-mono text-primary hover:underline" @click="open('')">{{ bucket }}</button>
      <template v-for="crumb in crumbs" :key="crumb.prefix">
        <span class="text-muted-foreground">/</span>
        <button type="button" class="font-mono text-primary hover:underline" @click="open(crumb.prefix)">{{ crumb.name }}</button>
      </template>
    </nav>
    <Input
      v-model="query"
      class="h-8 font-mono text-xs"
      placeholder="Name starts with, then Enter"
      aria-label="Find a name in this folder"
      @keydown.enter="find"
    />
    <p v-if="failure" class="text-xs text-destructive">{{ failure }}</p>
    <ul class="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border text-xs">
      <li v-for="path in prefixes" :key="path" class="flex items-center gap-2 px-3 py-1.5">
        <input type="checkbox" :checked="chosenFolders.has(path)" :aria-label="`Select folder ${tail(path)}`" @change="toggleFolder(path)" />
        <Folder class="h-3.5 w-3.5 shrink-0 text-primary" />
        <button type="button" class="truncate font-mono hover:underline" @click="open(path)">{{ tail(path) }}/</button>
      </li>
      <li v-for="item in objects" :key="item.key">
        <label class="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-muted/40">
          <input type="checkbox" :checked="chosenFiles.has(item.key)" :aria-label="`Select ${tail(item.key)}`" @change="toggleFile(item)" />
          <FileText class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span class="truncate font-mono">{{ tail(item.key) }}</span>
        </label>
      </li>
      <li v-if="!loading && !objects.length && !prefixes.length && !failure" class="px-3 py-3 text-muted-foreground">{{ asked ? 'No name here starts with that.' : 'This folder is empty.' }}</li>
    </ul>
    <p v-if="stale" class="text-xs text-muted-foreground">Part of this list comes from a copy and may miss recent changes.</p>
    <div class="flex items-center gap-2">
      <Button v-if="cursor" size="sm" variant="ghost" :disabled="loading" @click="load(true)">Show more</Button>
      <Spinner v-if="loading" />
      <span v-if="!count" class="ml-auto text-xs text-muted-foreground">Select files or folders to add them</span>
      <Button size="sm" :class="count ? 'ml-auto' : ''" :disabled="!count || busy" @click="add">Add {{ count || '' }} selected</Button>
    </div>
  </div>
</template>
