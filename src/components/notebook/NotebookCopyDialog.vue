<script setup lang="ts">
// Picks the bucket and folder a kernel file is copied into. The browsed
// folder is the target, the way the crate transfer dialog picks its prefix.
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Select from '@/components/ui/Select.vue'
import Spinner from '@/components/ui/Spinner.vue'
import ObjectBrowserPanel from '@/components/data/ObjectBrowserPanel.vue'
import { useAruna } from '@/composables/useAruna'
import { listBuckets, nodesByBucket } from '@/composables/useBucketCount'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { errorMessage } from '@/lib/utils'

const props = defineProps<{
  open: boolean
  /** What is copied, named in the title and on the button. */
  source: string
  /** Files below a folder source; a single file counts one. */
  count: number
  groupId?: string | null
  busy?: boolean
}>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  /** `nodeId`: the node holding the bucket; null is the connected node. */
  (e: 'copy', target: { bucket: string; prefix: string; nodeId: string | null }): void
}>()

const { searchBuckets, sessionEpoch } = useAruna()
const { isTarget, isLocalNode } = useRealmNodes()
const bucket = ref('')
const prefix = ref('')
// The group's buckets on every node, from the realm bucket search.
const places = ref(new Map<string, string | null>())
const loading = ref(false)
const loaded = ref(false)
const loadError = ref<string | null>(null)
const nodeId = computed(() => places.value.get(bucket.value) ?? null)
let run = 0

async function loadBuckets() {
  const mine = ++run
  const epoch = sessionEpoch.value
  const current = () => mine === run && epoch === sessionEpoch.value
  places.value = new Map()
  loaded.value = false
  loadError.value = null
  loading.value = true
  try {
    const listing = await listBuckets(searchBuckets, props.groupId ?? undefined, current)
    if (!current()) return
    places.value = nodesByBucket(listing.hits, isTarget, isLocalNode)
    loaded.value = true
  } catch (err) {
    if (current()) loadError.value = errorMessage(err)
  } finally {
    if (mine === run) loading.value = false
  }
}

const bucketOptions = computed(() => [...places.value.keys()].map((name) => ({ value: name, label: name })))

const target = computed(() => `s3://${bucket.value || 'bucket'}/${prefix.value ? `${prefix.value}/` : ''}`)
const label = computed(() => (props.count === 1 ? props.source : `${props.count} files`))

function onNavigate(location: { bucket: string; prefix: string }) {
  if (location.bucket !== bucket.value) return
  prefix.value = location.prefix.replace(/\/+$/, '')
}

// Another bucket is another key space; the picked folder never carries over.
function pickBucket(next: string) {
  bucket.value = next
  prefix.value = ''
}

watch(() => props.open, (open) => {
  if (!open) return
  bucket.value = ''
  prefix.value = ''
  void loadBuckets()
}, { immediate: true })

function confirm() {
  if (!bucket.value || props.busy) return
  emit('copy', { bucket: bucket.value, prefix: prefix.value ? `${prefix.value}/` : '', nodeId: nodeId.value })
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogContent class="max-w-xl">
      <DialogHeader>
        <DialogTitle>Copy to bucket</DialogTitle>
        <DialogDescription>Choose the bucket and folder that receives a copy of {{ label }}.</DialogDescription>
      </DialogHeader>

      <div class="space-y-3">
        <div>
          <label class="text-xs font-medium text-foreground">Bucket</label>
          <Select
            :model-value="bucket"
            :options="bucketOptions"
            placeholder="Choose a bucket"
            aria-label="Destination bucket"
            class="mt-1"
            @update:model-value="pickBucket"
          />
          <Spinner v-if="loading && !loaded" show-label label="Loading buckets…" class="mt-1 flex text-xs" />
          <p v-else-if="loadError" class="mt-1 text-xs text-destructive">{{ loadError }}</p>
        </div>
        <div v-if="bucket" class="rounded-md border border-border p-2">
          <ObjectBrowserPanel :key="bucket" flush :bucket="bucket" :node-id="nodeId" :group-id="groupId ?? undefined" @navigate="onNavigate" />
        </div>
        <p class="truncate font-mono text-xs text-muted-foreground" :title="target">{{ target }}</p>
      </div>

      <DialogFooter>
        <DialogClose as-child><Button variant="outline">Cancel</Button></DialogClose>
        <Button :disabled="!bucket || busy" @click="confirm">{{ busy ? 'Copying…' : `Copy ${label}` }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
