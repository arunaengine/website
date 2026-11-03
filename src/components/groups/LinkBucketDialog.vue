<script setup lang="ts">
// Link an S3 bucket or local folder of a storage to an Aruna bucket, then run its first sync.
import { computed, ref, useId, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import StorageFeatureLink from '@/components/distributed/StorageFeatureLink.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Select from '@/components/ui/Select.vue'
import { useAruna } from '@/composables/useAruna'
import { useImportRoots } from '@/composables/useImportRoots'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { ApiError, createBackendImport, runBackendImport, type BackendImport, type GroupBackendResponse } from '@/lib/api'
import { NAMING_OPTIONS, namingPattern, type NamingChoice } from '@/lib/bucketNaming'
import { folderPath } from '@/lib/linkedFolders'
import { folderProblem } from '@/lib/storage'
import { arunaConflict, bucketProblem, linkConflict, splitsBuckets } from '@/lib/storageRules'
import { errorMessage } from '@/lib/utils'

const props = defineProps<{
  open: boolean
  groupId: string
  backend: GroupBackendResponse | null
  /** All storages of the group, to pick where a read-only folder writes. */
  backends: GroupBackendResponse[]
  links: BackendImport[]
}>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void; (e: 'saved', runError?: string): void }>()

const { apiBaseUrl, authToken, sessionEpoch } = useAruna()
const { writesDisabled } = useConnectivity()
const uid = useId()

const NAMES = NAMING_OPTIONS.filter((option) => option.value === 'plain' || option.value === 'suffix')

const s3Bucket = ref('')
const folder = ref('')
const arunaBucket = ref('')
const naming = ref<NamingChoice>('plain')
const writer = ref('')
const saving = ref(false)
const submitError = ref<string | null>(null)

const folderMode = computed(() => props.backend?.kind === 'fs')
const { roots, state: rootsState, error: rootsError, load: reloadRoots } = useImportRoots(
  computed(() => props.groupId),
  computed(() => props.open && folderMode.value),
)
const rootInfo = computed(() => roots.value.find((root) => root.name === props.backend?.public_config.root))
// A read-only folder cannot take new uploads, so another storage must.
const needsWriter = computed(() => folderMode.value && rootsState.value === 'ready' && rootInfo.value?.writable !== true)
const writable = (other: GroupBackendResponse) =>
  other.kind !== 'fs' || roots.value.some((root) => root.name === other.public_config.root && root.writable)
const writers = computed(() =>
  props.backends
    .filter((other) => other.backend_id !== props.backend?.backend_id && !other.disabled && writable(other))
    .map((other) => ({ value: other.backend_id, label: other.name })),
)
const rootProblem = computed(() => {
  if (!folderMode.value || rootsState.value !== 'ready') return null
  return rootInfo.value ? null : 'The node operator no longer approves this folder.'
})

const splits = computed(() => Boolean(props.backend && splitsBuckets(props.backend)))
const storagePath = computed(() => (splits.value ? `${s3Bucket.value.trim()}/${folderPath(folder.value)}` : folderPath(folder.value)))
const bucket = computed(() => arunaBucket.value.trim() || (splits.value ? s3Bucket.value.trim() : ''))
const ready = computed(
  () =>
    Boolean(bucket.value && (!splits.value || s3Bucket.value.trim())) &&
    (!folderMode.value || (rootsState.value === 'ready' && !rootProblem.value)) &&
    (!needsWriter.value || writers.value.some((option) => option.value === writer.value)),
)
const problem = computed(() => {
  if (!props.backend || !ready.value) return null
  return (
    (folderMode.value ? folderProblem(storagePath.value) : null) ??
    bucketProblem(bucket.value) ??
    arunaConflict(props.links, bucket.value, '') ??
    linkConflict(props.backend, props.links, storagePath.value, null, true)
  )
})

watch(
  () => props.open,
  (open) => {
    if (!open) return
    s3Bucket.value = ''
    folder.value = ''
    arunaBucket.value = ''
    writer.value = ''
    naming.value = 'plain'
    submitError.value = null
  },
)

watch(sessionEpoch, () => {
  if (props.open) emit('update:open', false)
})

async function submit() {
  const backend = props.backend
  if (!backend || !ready.value || problem.value || saving.value || writesDisabled.value) return
  saving.value = true
  submitError.value = null
  const client = { baseUrl: apiBaseUrl.value, token: authToken.value }
  const epoch = sessionEpoch.value
  try {
    const created = await createBackendImport(
      props.groupId,
      {
        backend_id: backend.backend_id,
        backend_prefix: storagePath.value,
        bucket: bucket.value,
        key_prefix: '',
        ...(needsWriter.value ? { write_backend_id: writer.value } : {}),
        write_pattern: namingPattern(naming.value, ''),
      },
      client,
    )
    let runError: string | undefined
    try {
      await runBackendImport(props.groupId, created.import_id, client)
    } catch (err) {
      // A run the node already started is what was asked for.
      if (!(err instanceof ApiError && err.status === 409)) runError = `Linked, but the first sync did not start: ${errorMessage(err)}`
    }
    if (epoch !== sessionEpoch.value) return
    emit('saved', runError)
    emit('update:open', false)
  } catch (err) {
    if (epoch === sessionEpoch.value) submitError.value = errorMessage(err)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogContent class="max-w-xl">
      <DialogHeader>
        <DialogTitle>{{ folderMode ? 'Link a folder' : 'Link an S3 bucket' }}</DialogTitle>
        <DialogDescription>
          Files already in it show up in Aruna. Nothing is copied.
          <StorageFeatureLink question="elsewhere" class="ml-1" />
        </DialogDescription>
      </DialogHeader>
      <form class="grid gap-4" @submit.prevent="submit">
        <div class="grid gap-3 sm:grid-cols-2">
          <div v-if="splits">
            <label :for="`${uid}-s3`" class="text-xs font-medium">S3 bucket</label>
            <Input :id="`${uid}-s3`" v-model="s3Bucket" class="mt-1 font-mono" placeholder="lab-raw" />
          </div>
          <div>
            <label :for="`${uid}-folder`" class="text-xs font-medium">Folder <span class="text-muted-foreground">(optional)</span></label>
            <Input :id="`${uid}-folder`" v-model="folder" class="mt-1 font-mono" :placeholder="splits ? 'whole bucket' : 'whole storage'" />
          </div>
          <div>
            <label :for="`${uid}-aruna`" class="text-xs font-medium">Aruna bucket</label>
            <Input
              :id="`${uid}-aruna`"
              v-model="arunaBucket"
              class="mt-1 font-mono"
              :placeholder="splits ? 'same as S3 bucket' : 'sequencing'"
            />
          </div>
          <div>
            <label class="text-xs font-medium">New uploads are named</label>
            <Select v-model="naming" :options="NAMES" aria-label="New uploads are named" class="mt-1" />
          </div>
        </div>
        <p v-if="rootsState === 'loading'" class="text-xs text-muted-foreground">Loading approved folders…</p>
        <Notice v-else-if="rootsState === 'failed'" tone="error">
          {{ rootsError }}
          <button type="button" class="ml-1 underline" @click="reloadRoots">Try again</button>
        </Notice>
        <p v-if="rootProblem" class="text-xs text-destructive">{{ rootProblem }}</p>
        <div v-if="needsWriter && rootInfo">
          <label class="text-xs font-medium">Write new uploads to</label>
          <Select v-model="writer" :options="writers" placeholder="Pick a storage" aria-label="Write new uploads to" class="mt-1" />
          <p class="mt-1 text-[11px] text-muted-foreground">
            This folder is read-only, so Aruna cannot write new files into it.
            {{ writers.length ? 'Pick another storage that takes them.' : 'Add another storage that takes them first.' }}
          </p>
        </div>
        <p v-if="problem" class="text-xs text-destructive">{{ problem }}</p>
        <p v-else-if="ready" class="text-xs text-muted-foreground">
          After linking: <span class="font-mono text-foreground">{{ storagePath || '/' }}</span> ⇆ Aruna bucket
          <span class="font-mono text-foreground">{{ bucket }}</span>
        </p>
        <Notice v-if="submitError" tone="error">{{ submitError }}</Notice>
        <DialogFooter>
          <DialogClose as-child><Button type="button" variant="outline" size="sm">Cancel</Button></DialogClose>
          <Button
            type="submit"
            size="sm"
            :disabled="!ready || Boolean(problem) || saving || writesDisabled"
            :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
          >
            {{ saving ? 'Linking…' : 'Link and sync' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
