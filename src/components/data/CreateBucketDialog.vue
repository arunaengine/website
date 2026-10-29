<script setup lang="ts">
// New bucket on the web: a name and the place that stores it. One realm node holds an ordinary
// bucket, made through a session on that node; spread over several nodes, the storage dialog sets
// the copies and each node's answer is shown.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import RefusalNote from '@/components/ui/RefusalNote.vue'
import Spinner from '@/components/ui/Spinner.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import BucketCreateResults from '@/components/data/BucketCreateResults.vue'
import BucketStorageDialog from '@/components/data/BucketStorageDialog.vue'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { s3ErrorMessage, useS3 } from '@/composables/useS3'
import type { AdmissionResponse } from '@/lib/api'
import type { BindSource } from '@/lib/bindSource'
import { BUCKET_NAME_REQUIREMENT, bucketNameProblem } from '@/lib/bucketName'
import { readFreeSpace } from '@/lib/bucketPlace'
import { defaultPlacement, placementLabel, type Placement } from '@/lib/distributedMock'
import { formatBytes } from '@/lib/utils'
import { FolderPlus, Network, Server } from '@lucide/vue'

const props = defineProps<{ open: boolean; groupId: string | null; nodeId: string | null }>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'created', bucket: BindSource): void
}>()

const SPREAD = 'several'
const { apiBaseUrl, sessionEpoch } = useAruna()
const realmNodes = useRealmNodes()
const s3 = useS3()

const name = ref('')
const choice = ref('')
const error = ref<string | null>(null)
const creating = ref(false)
const placement = ref<Placement>(defaultPlacement())
const storageOpen = ref(false)
const resultsOpen = ref(false)
// Space left per node; a missing entry is still being read.
const free = ref(new Map<string, number | null>())

// The reachable realm nodes, the open node first; devices hold no new buckets here.
const places = computed(() =>
  realmNodes.nodes.value
    .filter((node) => node.kind !== 'user' && node.reachable)
    .sort((a, b) => Number(b.nodeId === props.nodeId) - Number(a.nodeId === props.nodeId)),
)
const trimmed = computed(() => name.value.trim())
const nameProblem = computed(() => (trimmed.value ? bucketNameProblem(trimmed.value) : null))
const spread = computed(() => choice.value === SPREAD)
const canCreate = computed(() => Boolean(trimmed.value && props.groupId && choice.value) && !nameProblem.value && !creating.value)

function freeLabel(id: string): string {
  if (!free.value.has(id)) return ''
  const bytes = free.value.get(id)
  return bytes == null ? '' : `${formatBytes(bytes)} free`
}

let freeRun = 0
function loadFree() {
  const run = ++freeRun
  free.value = new Map()
  for (const entry of places.value) {
    void readFreeSpace(entry.isLocal ? apiBaseUrl.value : entry.apiBase).then((bytes) => {
      if (run === freeRun) free.value = new Map(free.value).set(entry.nodeId, bytes)
    })
  }
}

// Bumped on every open, close and unmount, so an older create ends unseen.
let generation = 0
onBeforeUnmount(() => generation++)
watch(
  () => props.open,
  (open) => {
    generation++
    if (!open) return
    name.value = ''
    error.value = null
    creating.value = false
    placement.value = defaultPlacement()
    choice.value = places.value[0]?.nodeId ?? ''
    loadFree()
  },
  { immediate: true },
)
// The realm's nodes may arrive after the dialog opened.
watch(places, (entries) => {
  if (!props.open) return
  if (!choice.value) choice.value = entries[0]?.nodeId ?? ''
  loadFree()
})

// Back to one node in the storage dialog: the first node is chosen again.
watch(placement, (value) => {
  if (!value.several && spread.value) choice.value = places.value[0]?.nodeId ?? ''
})

function pick(value: string) {
  choice.value = value
  if (value === SPREAD && !placement.value.several) {
    placement.value = { ...defaultPlacement(), several: true }
    storageOpen.value = true
  }
}

async function submit() {
  if (!canCreate.value || !props.groupId) return
  if (spread.value) return void (resultsOpen.value = true)
  const target: BindSource = { bucket: trimmed.value, nodeId: choice.value, groupId: props.groupId }
  creating.value = true
  error.value = null
  const run = generation
  const epoch = sessionEpoch.value
  const current = () => run === generation && epoch === sessionEpoch.value
  try {
    const session = await s3.activateContext(target.nodeId, target.groupId)
    const reference = { nodeId: session.issuerNodeId, groupId: target.groupId, accessKeyId: session.accessKeyId }
    await s3.createBucket(target.bucket, session.issuerNodeId, reference)
    if (!current()) return
    emit('created', target)
    emit('update:open', false)
  } catch (err) {
    if (current()) error.value = s3ErrorMessage(err, target.bucket)
  } finally {
    if (run === generation) creating.value = false
  }
}

// A spread bucket opens where one of its nodes answered.
function spreadCreated(outcome: AdmissionResponse) {
  const member = outcome.members.find((entry) => realmNodes.isLocalNode(entry.node_id)) ?? outcome.members[0]
  if (member && props.groupId) emit('created', { bucket: trimmed.value, nodeId: member.node_id, groupId: props.groupId })
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogContent class="max-w-md">
      <DialogHeader>
        <DialogTitle>New bucket</DialogTitle>
      </DialogHeader>

      <div class="space-y-4">
        <label class="block">
          <span class="text-xs text-muted-foreground">Name</span>
          <Input
            v-model="name"
            class="mt-1"
            placeholder="bucket-name"
            aria-label="Bucket name"
            :invalid="nameProblem ? 'error' : undefined"
            @keyup.enter="submit"
          />
          <span class="mt-1 block text-xs" :class="nameProblem ? 'text-destructive' : 'text-muted-foreground'">{{ nameProblem ?? BUCKET_NAME_REQUIREMENT }}</span>
        </label>

        <fieldset>
          <legend class="text-xs text-muted-foreground">Stored on</legend>
          <div class="mt-1 grid gap-1.5">
            <label
              v-for="entry in places"
              :key="entry.nodeId"
              class="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md border px-3 text-sm"
              :class="choice === entry.nodeId ? 'border-primary' : 'border-input hover:bg-muted/50'"
            >
              <input type="radio" name="bucket-place" class="accent-primary" :checked="choice === entry.nodeId" @change="pick(entry.nodeId)" />
              <Server class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span class="min-w-0 flex-1 truncate">{{ realmNodes.displayName(entry.nodeId) }}</span>
              <span class="shrink-0 text-xs tabular-nums text-muted-foreground">{{ freeLabel(entry.nodeId) }}</span>
            </label>
            <label
              class="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md border px-3 text-sm"
              :class="spread ? 'border-primary' : 'border-input hover:bg-muted/50'"
            >
              <input type="radio" name="bucket-place" class="accent-primary" :checked="spread" @change="pick(SPREAD)" />
              <Network class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span class="min-w-0 flex-1 truncate">Spread over several nodes</span>
              <span class="shrink-0 text-xs text-muted-foreground">for large data</span>
            </label>
          </div>
          <p v-if="!places.length" class="mt-1 text-xs text-muted-foreground">No reachable realm node is known yet.</p>
          <button v-if="spread" type="button" class="mt-1.5 text-xs text-primary hover:underline" @click="storageOpen = true">
            {{ placementLabel(placement) }}: change the nodes and copies
          </button>
        </fieldset>

        <RefusalNote v-if="error" :message="error" />
      </div>

      <DialogFooter>
        <DialogClose as-child><Button variant="outline">Cancel</Button></DialogClose>
        <Button :disabled="!canCreate" @click="submit">
          <Spinner v-if="creating" label="Creating the bucket…" />
          <FolderPlus v-else class="h-4 w-4" />
          Create bucket
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  <BucketStorageDialog v-model:open="storageOpen" v-model="placement" />
  <BucketCreateResults
    v-if="groupId"
    v-model:open="resultsOpen"
    :name="trimmed"
    :group-id="groupId"
    :placement="placement"
    @created="spreadCreated"
  />
</template>
