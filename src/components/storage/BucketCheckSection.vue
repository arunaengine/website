<script setup lang="ts">
// Looks for files whose stored copy is gone and lets a group admin remove their records.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Progress from '@/components/ui/Progress.vue'
import { isUnsupportedEndpoint } from '@/composables/useAruna'
import { apiBaseUrl, authToken } from '@/composables/aruna/state'
import { localNodeId, nodeApiBase } from '@/composables/s3/endpoints'
import {
  ApiError,
  cleanBucketCheck,
  getBucketCheck,
  startBucketCheck,
  type CheckProgress,
} from '@/lib/api'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { errorMessage, formatNumber } from '@/lib/utils'

const props = defineProps<{ bucket: string; nodeId: string | null }>()

const { writesDisabled } = useConnectivity()
const progress = ref<CheckProgress | null>(null)
const supported = ref(true)
const busy = ref(false)
const confirming = ref(false)
const note = ref<string | null>(null)
const error = ref<string | null>(null)

const running = computed(() => Boolean(progress.value && progress.value.finished_at_ms == null))
const broken = computed(() => progress.value?.broken ?? 0)

let timer: ReturnType<typeof setTimeout> | undefined
let generation = 0
function stopPoll() {
  if (timer !== undefined) clearTimeout(timer)
  timer = undefined
}

function client() {
  const node = props.nodeId ?? localNodeId()
  return { baseUrl: (node ? nodeApiBase(node) : apiBaseUrl.value) ?? '', token: authToken.value }
}

async function load() {
  const current = generation
  stopPoll()
  try {
    const answer = await getBucketCheck(props.bucket, { limit: 1 }, client())
    if (current !== generation) return
    progress.value = answer.progress ?? null
    if (running.value) timer = setTimeout(() => void load(), 3_000)
  } catch (err) {
    if (current !== generation) return
    if (isUnsupportedEndpoint(err)) supported.value = false
    else error.value = errorMessage(err)
  }
}

watch(
  () => [props.bucket, props.nodeId],
  () => {
    generation += 1
    progress.value = null
    supported.value = true
    note.value = null
    error.value = null
    void load()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  generation += 1
  stopPoll()
})

async function act(work: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  note.value = null
  error.value = null
  try {
    await work()
  } catch (err) {
    const going = err instanceof ApiError && err.status === 409
    if (!going) error.value = errorMessage(err)
  } finally {
    busy.value = false
    await load()
  }
}

const check = () => act(async () => void (await startBucketCheck(props.bucket, client())))

function cleanUp() {
  confirming.value = false
  return act(async () => {
    const done = await cleanBucketCheck(props.bucket, client())
    note.value = `Removed ${formatNumber(done.deleted)} files.${done.more ? ' More are left. Clean up again.' : ''}`
  })
}
</script>

<template>
  <section v-if="supported" class="surface" data-testid="check-files">
    <header class="flex flex-wrap items-center gap-2 border-b border-border px-5 py-4">
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Check files</h2>
      <span class="flex-1" />
      <Button
        v-if="broken > 0 && !running"
        variant="destructive"
        size="sm"
        :disabled="busy || writesDisabled"
        :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
        @click="confirming = true"
      >
        Clean up
      </Button>
      <Button
        variant="outline"
        size="sm"
        :disabled="busy || running || writesDisabled"
        :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
        @click="check"
      >
        Check files
      </Button>
    </header>
    <div class="space-y-2 px-5 py-4 text-xs text-muted-foreground">
      <p>Finds files whose stored copy is gone. They show in red in the file list.</p>
      <template v-if="progress">
        <p v-if="running">Checking files: {{ formatNumber(progress.checked) }} checked</p>
        <p v-else>
          Checked {{ formatNumber(progress.checked) }} files.
          <span v-if="broken > 0" class="text-destructive">{{ formatNumber(broken) }} broken.</span>
          <template v-else>None broken.</template>
        </p>
        <Progress v-if="running" indeterminate :warn="101" :critical="101" bar-class="bg-primary" class="h-1" />
      </template>
      <p v-if="note" class="text-foreground">{{ note }}</p>
      <p v-if="error" class="text-destructive">{{ error }}</p>
    </div>

    <Dialog :open="confirming" @update:open="(v: boolean) => (confirming = v)">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Clean up broken files?</DialogTitle>
          <DialogDescription>
            The {{ formatNumber(broken) }} broken files are removed from this bucket. Their stored copy is already gone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose as-child><Button type="button" variant="outline">Cancel</Button></DialogClose>
          <Button variant="destructive" :disabled="busy || writesDisabled" @click="cleanUp">Clean up</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>
