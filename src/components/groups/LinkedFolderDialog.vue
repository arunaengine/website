<script setup lang="ts">
// Link a bucket of your storage with an Aruna bucket. A stored link only changes its schedule.
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import { computed, ref, useId, watch } from 'vue'
import { FolderSync } from '@lucide/vue'
import { useAruna } from '@/composables/useAruna'
import { useBucketCheck } from '@/composables/useBucketCheck'
import { useBuckets } from '@/composables/useBuckets'
import { useS3 } from '@/composables/useS3'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import {
  ApiError,
  createBackendImport,
  deleteBackendImport,
  getImportRenames,
  runBackendImport,
  startImportRenames,
  startBucketMove,
  updateBackendImport,
  type BackendImport,
  type BackendImportRenames,
  type BackendImportRequest,
  type GroupBackendResponse,
} from '@/lib/api'
import {
  cronProblem,
  fillPattern,
  folderPath,
  NAME_PATTERNS,
  patternProblem,
  placeLabel,
  SCHEDULES,
  scheduleWords,
  storeLabel,
  storeLine,
  storeName,
  writesElsewhere,
  writesInside,
} from '@/lib/linkedFolders'
import { arunaConflict, linkConflict, moveRefusal, splitPath, splitsBuckets } from '@/lib/storageRules'
import { errorMessage } from '@/lib/utils'

const props = defineProps<{
  open: boolean
  groupId: string
  backends: GroupBackendResponse[]
  link?: BackendImport | null
  /** The other links of the group, for the overlap check. */
  links?: BackendImport[]
  /** The storage a new link starts on. */
  storageId?: string | null
  /** Files of a stored link may need a move. */
  movable?: boolean
}>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'saved', runError?: string): void
}>()

const { apiBaseUrl, authToken, sessionEpoch } = useAruna()
const { writesDisabled } = useConnectivity()
const bucketList = useBuckets()
const s3 = useS3()
const uid = useId()

const SAMPLE_ID = '01JA7Q3K'
const PATTERN_OPTIONS = [...NAME_PATTERNS, { value: 'custom', label: 'Custom' }]
const SCHEDULE_OPTIONS = [...SCHEDULES, { value: 'custom', label: 'Custom' }]

const backendId = ref('')
const storageBucket = ref('')
const backendFolder = ref('')
const bucket = ref('')
const bucketFolder = ref('')
const pattern = ref(NAME_PATTERNS[0].value)
const writeElsewhere = ref(false)
const moveFiles = ref(false)
const writeBackendId = ref('')
const writeFolder = ref('')
const scheduleChoice = ref('')
const cron = ref('')
const saving = ref(false)
const confirmingDelete = ref(false)
const submitError = ref<string | null>(null)
// Files of a stored link that still have a name of an earlier pattern.
const renames = ref<BackendImportRenames | null>(null)
const renaming = computed(() => Boolean(renames.value?.progress && renames.value.progress.finished_at_ms == null))
// An unknown count (not complete) still offers the rename.
const offerRename = computed(() => {
  const found = renames.value
  return Boolean(found && (found.count > 0 || !found.complete)) && !patternChanged.value
})

const isEdit = computed(() => Boolean(props.link))
const backendOptions = computed(() =>
  props.backends
    .filter((backend) => isEdit.value || !backend.disabled)
    .map((backend) => ({ value: backend.backend_id, label: backend.name })),
)
// The cached buckets belong to the active S3 context; another group or node keeps manual entry.
const bucketOptions = computed(() => {
  const context = s3.activeContext.value
  if (context?.groupId !== props.groupId || context.nodeId !== s3.nodeIdFor(null)) return []
  return bucketList.buckets.value.map((entry) => ({ value: entry.name, label: entry.name }))
})
const patternChoice = computed(
  () => NAME_PATTERNS.find((preset) => preset.value === pattern.value.trim())?.value ?? 'custom',
)
// Only a storage without a fixed bucket links a whole provider bucket, as `mapped_bucket` on the node.
const wholeBucket = computed(() => {
  const stored = props.link
  return Boolean(stored && splits.value && !folderPath(backendFolder.value) && !stored.key_prefix && !writesElsewhere(stored))
})
const patternError = computed(() => {
  const chosen = pattern.value.trim()
  if (wholeBucket.value && chosen === '{dir}{name}' && savedPattern.value !== chosen) {
    return 'A whole linked bucket cannot switch to the same name.'
  }
  return patternProblem(chosen)
})
// A whole linked provider bucket keeps plain names, and an older node keeps its pattern.
const patternLocked = computed(() => {
  const stored = props.link
  if (!stored) return false
  return !stored.write_pattern || (wholeBucket.value && stored.write_pattern === '{dir}{name}')
})
// The pattern the node has now; a save in this dialog changes it before the link reloads.
const savedPattern = ref<string | null>(null)
const patternChanged = computed(() => Boolean(props.link) && pattern.value.trim() !== savedPattern.value)
const schedule = computed(() => (scheduleChoice.value === 'custom' ? cron.value.trim() : scheduleChoice.value))
const scheduleError = computed(() => (scheduleChoice.value === 'custom' ? cronProblem(cron.value) : null))

const findBackend = (id: string) => props.backends.find((backend) => backend.backend_id === id)
const source = computed(() => findBackend(backendId.value))
const target = computed(() => findBackend(writeBackendId.value))
const sourceStore = computed(() => {
  if (!source.value) return 'your storage'
  return splits.value ? source.value.name : storeName(source.value)
})
const bucketName = computed(() => bucket.value.trim() || 'Aruna bucket')
const splits = computed(() => Boolean(source.value && splitsBuckets(source.value)))
// On a storage without a fixed bucket the path starts with the bucket.
const storageRoot = computed(() =>
  splits.value
    ? `${storageBucket.value.trim()}/${folderPath(backendFolder.value)}`
    : folderPath(backendFolder.value),
)
const bucketRoot = computed(() => folderPath(bucketFolder.value))
const writeStore = computed(() => {
  if (!writeElsewhere.value) return sourceStore.value
  return target.value ? storeName(target.value) : 'your storage'
})
const conflict = computed(() => {
  if (isEdit.value) return null
  const others = props.links ?? []
  const aruna = bucket.value.trim() ? arunaConflict(others, bucket.value.trim(), bucketRoot.value) : null
  if (aruna || !source.value) return aruna
  if (splits.value && !storageBucket.value.trim()) return null
  // Links that write inside the folder they read may share it, as the node allows.
  const shared = writesInside({
    backend_id: backendId.value,
    backend_prefix: storageRoot.value,
    write_backend_id: writeElsewhere.value ? writeBackendId.value : null,
    write_prefix: writeElsewhere.value ? folderPath(writeFolder.value) : null,
  })
  const read = linkConflict(source.value, others, storageRoot.value, null, shared)
  if (read || !writeElsewhere.value || !target.value) return read
  return linkConflict(target.value, others, folderPath(writeFolder.value), null, shared)
})
const writeRoot = computed(() => (writeElsewhere.value ? folderPath(writeFolder.value) : storageRoot.value))
const exampleUpload = computed(() =>
  placeLabel(writeStore.value, `${writeRoot.value}${fillPattern(pattern.value.trim(), 'run2/', 'b.fastq', SAMPLE_ID)}`),
)

const submitDisabled = computed(() => {
  if (saving.value || writesDisabled.value || scheduleError.value) return true
  if (isEdit.value) {
    if (patternChanged.value && patternError.value) return true
    return schedule.value === (props.link?.schedule ?? '') && !moveFiles.value && !patternChanged.value
  }
  return (
    !backendId.value ||
    !bucket.value.trim() ||
    (splits.value && !storageBucket.value.trim()) ||
    Boolean(conflict.value) ||
    Boolean(patternError.value) ||
    (writeElsewhere.value && !writeBackendId.value)
  )
})

// Each opening is a new draft; a save from an earlier opening must not touch it.
let opening = 0

function pickPattern(value: string) {
  if (value !== 'custom') pattern.value = value
}

function pickSchedule(value: string) {
  scheduleChoice.value = value
  if (value === 'custom' && !cron.value) cron.value = '0 3 * * *'
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    opening += 1
    saving.value = false
    const stored = props.link
    const fallback = backendOptions.value.length === 1 ? backendOptions.value[0].value : ''
    backendId.value = stored?.backend_id ?? props.storageId ?? fallback
    const chosen = findBackend(backendId.value)
    const place = chosen && stored ? splitPath(chosen, stored.backend_prefix) : null
    storageBucket.value = chosen && splitsBuckets(chosen) ? (place?.bucket ?? '') : ''
    backendFolder.value = chosen && splitsBuckets(chosen) ? (place?.folder ?? '') : (stored?.backend_prefix ?? '')
    confirmingDelete.value = false
    bucket.value = stored?.bucket ?? ''
    bucketFolder.value = stored?.key_prefix ?? ''
    pattern.value = stored?.write_pattern ?? NAME_PATTERNS[0].value
    savedPattern.value = stored?.write_pattern ?? null
    writeElsewhere.value = Boolean(stored && writesElsewhere(stored))
    moveFiles.value = false
    writeBackendId.value = stored?.write_backend_id ?? ''
    writeFolder.value = stored?.write_prefix ?? ''
    const savedSchedule = stored?.schedule ?? ''
    const preset = SCHEDULES.some((option) => option.value === savedSchedule)
    scheduleChoice.value = preset ? savedSchedule : 'custom'
    cron.value = preset ? '' : savedSchedule
    submitError.value = null
    renames.value = null
    if (!stored) void bucketList.ensure()
    else void loadRenames(stored, opening)
  },
)

// Older nodes have no rename route; the offer then stays hidden.
// Only the latest load counts; a pattern save bumps it too.
let renameLoad = 0
async function loadRenames(stored: BackendImport, generation: number) {
  const id = ++renameLoad
  const latest = () => generation === opening && id === renameLoad
  try {
    const found = await getImportRenames(props.groupId, stored.import_id, { baseUrl: apiBaseUrl.value, token: authToken.value })
    if (latest()) renames.value = found
  } catch {
    if (latest()) renames.value = null
  }
}

async function rename() {
  const stored = props.link
  if (!stored || saving.value) return
  submitError.value = null
  saving.value = true
  const generation = opening
  try {
    await startImportRenames(props.groupId, stored.import_id, { baseUrl: apiBaseUrl.value, token: authToken.value })
    emit('saved')
    if (generation === opening) emit('update:open', false)
  } catch (err) {
    if (generation === opening) submitError.value = moveRefusal(err) ?? errorMessage(err)
  } finally {
    if (generation === opening) saving.value = false
  }
}

const bucketNote = useBucketCheck(() =>
  props.open && !isEdit.value && splits.value
    ? { groupId: props.groupId, backendId: backendId.value, bucket: storageBucket.value }
    : null,
)

// Another account or realm must never inherit an open form.
watch(sessionEpoch, () => {
  if (props.open) emit('update:open', false)
})

function body(): BackendImportRequest {
  const request: BackendImportRequest = {
    backend_id: backendId.value,
    backend_prefix: storageRoot.value,
    bucket: bucket.value.trim(),
    key_prefix: bucketRoot.value,
    write_pattern: pattern.value.trim(),
  }
  if (writeElsewhere.value) {
    request.write_backend_id = writeBackendId.value
    request.write_prefix = folderPath(writeFolder.value)
  }
  if (schedule.value) request.schedule = schedule.value
  if (moveFiles.value) request.move_existing = true
  return request
}

async function remove() {
  if (!props.link || saving.value) return
  submitError.value = null
  saving.value = true
  const generation = opening
  try {
    await deleteBackendImport(props.groupId, props.link.import_id, {
      baseUrl: apiBaseUrl.value,
      token: authToken.value,
    })
    emit('saved')
    if (generation === opening) emit('update:open', false)
  } catch (err) {
    if (generation === opening) submitError.value = errorMessage(err)
  } finally {
    if (generation === opening) saving.value = false
  }
}

async function submit() {
  if (submitDisabled.value) return
  submitError.value = null
  saving.value = true
  const client = { baseUrl: apiBaseUrl.value, token: authToken.value }
  const epoch = sessionEpoch.value
  const generation = opening
  const current = () => generation === opening
  // The draft may be reopened while this runs; keep what was asked.
  const stored = props.link
  const move = moveFiles.value
  const wanted = schedule.value
  const newPattern = patternChanged.value ? pattern.value.trim() : undefined
  try {
    let runError: string | undefined
    if (stored) {
      if (wanted !== (stored.schedule ?? '') || newPattern !== undefined) {
        if (newPattern !== undefined) renameLoad++
        await updateBackendImport(props.groupId, stored.import_id, wanted || null, client, newPattern)
      }
      if (move) await startBucketMove(stored.bucket, stored.key_prefix, client)
    } else {
      const created = await createBackendImport(props.groupId, body(), client)
      try {
        await runBackendImport(props.groupId, created.import_id, client)
      } catch (err) {
        // A run the node already started is what was asked for.
        if (!(err instanceof ApiError && err.status === 409)) runError = `Linked, but the first run did not start: ${errorMessage(err)}`
      }
    }
    if (epoch !== sessionEpoch.value) return
    emit('saved', runError)
    // After a new pattern, files with the old name are offered for renaming.
    if (stored && newPattern !== undefined && current()) {
      await loadRenames({ ...stored, write_pattern: newPattern }, generation)
      if (current() && renames.value && (renames.value.count > 0 || !renames.value.complete)) {
        pattern.value = newPattern
        savedPattern.value = newPattern
        return
      }
    }
    if (current()) emit('update:open', false)
  } catch (err) {
    if (epoch !== sessionEpoch.value || !current()) return
    submitError.value = moveRefusal(err) ?? errorMessage(err)
  } finally {
    if (current()) saving.value = false
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-3xl">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <FolderSync class="h-4 w-4 text-primary" />
          {{ isEdit ? 'Edit linked bucket' : 'Link a bucket' }}
        </DialogTitle>
        <DialogDescription>
          Show the same files in Aruna and in your storage, both ways.
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-3" @submit.prevent="submit">
        <div class="max-h-[65vh] space-y-3 overflow-y-auto px-1 scrollbar-thin">
          <fieldset class="space-y-3 rounded-md border border-border p-3">
            <legend class="mb-0 px-1 text-xs font-semibold text-foreground">Your storage → Aruna</legend>
            <p class="text-[11px] text-muted-foreground">
              Files already in your storage appear in Aruna. Nothing is copied.
            </p>
            <div class="grid gap-3 sm:grid-cols-2">
              <div class="space-y-1">
                <label class="text-xs font-medium text-foreground">From your storage</label>
                <Select
                  :model-value="backendId"
                  :options="backendOptions"
                  :disabled="isEdit"
                  placeholder="Choose a storage"
                  aria-label="From your storage"
                  @update:model-value="(v: string) => (backendId = v)"
                />
                <p v-if="source" class="break-all text-[11px] text-muted-foreground">{{ storeLine(source) }}</p>
              </div>
              <div v-if="splits" class="space-y-1">
                <label :for="`${uid}-source-bucket`" class="text-xs font-medium text-foreground">
                  Bucket in {{ source?.name }}
                </label>
                <Input
                  :id="`${uid}-source-bucket`"
                  v-model="storageBucket"
                  :disabled="isEdit"
                  class="font-mono text-xs"
                  placeholder="lab-raw"
                />
                <p
                  v-if="bucketNote"
                  class="text-[11px] font-medium"
                  :class="bucketNote.warning ? 'text-amber-700 dark:text-amber-300' : 'text-foreground'"
                >
                  {{ bucketNote.text }}
                </p>
                <p v-else class="text-[11px] text-muted-foreground">Aruna creates the bucket if it is missing.</p>
              </div>
              <div class="space-y-1">
                <label :for="`${uid}-source-folder`" class="text-xs font-medium text-foreground">
                  {{ splits ? 'Folder in the bucket' : 'Folder in your storage' }}
                </label>
                <Input
                  :id="`${uid}-source-folder`"
                  v-model="backendFolder"
                  :disabled="isEdit"
                  class="font-mono text-xs"
                  placeholder="raw/2024/"
                />
                <p class="text-[11px] text-muted-foreground">
                  Leave empty to use {{ splits ? 'the whole bucket' : `all files in ${source ? storeLabel(source) : 'your storage'}` }}.
                </p>
              </div>
              <div class="space-y-1">
                <label :for="`${uid}-bucket`" class="text-xs font-medium text-foreground">To Aruna bucket</label>
                <Select
                  v-if="bucketOptions.length && !isEdit"
                  :model-value="bucket"
                  :options="bucketOptions"
                  placeholder="Choose an Aruna bucket"
                  aria-label="To Aruna bucket"
                  @update:model-value="(v: string) => (bucket = v)"
                />
                <Input
                  v-else
                  :id="`${uid}-bucket`"
                  v-model="bucket"
                  :disabled="isEdit"
                  class="font-mono text-xs"
                  placeholder="sequencing"
                />
                <p class="text-[11px] text-muted-foreground">The bucket in Aruna where the files appear.</p>
              </div>
              <div class="space-y-1">
                <label :for="`${uid}-bucket-folder`" class="text-xs font-medium text-foreground">
                  Folder in the Aruna bucket
                </label>
                <Input
                  :id="`${uid}-bucket-folder`"
                  v-model="bucketFolder"
                  :disabled="isEdit"
                  class="font-mono text-xs"
                  placeholder="runs/"
                />
                <p class="text-[11px] text-muted-foreground">
                  Leave empty to place files at the top of {{ bucket.trim() || 'the Aruna bucket' }}.
                </p>
              </div>
            </div>

            <div>
              <label class="text-xs font-medium text-foreground">Look for new files</label>
              <div class="mt-1 grid gap-2 sm:grid-cols-2">
                <Select
                  :model-value="scheduleChoice"
                  :options="SCHEDULE_OPTIONS"
                  aria-label="Look for new files"
                  @update:model-value="pickSchedule"
                />
                <Input
                  v-if="scheduleChoice === 'custom'"
                  v-model="cron"
                  aria-label="Cron schedule"
                  :invalid="scheduleError ? 'error' : undefined"
                  class="font-mono text-xs"
                  placeholder="0 3 * * *"
                />
              </div>
              <p v-if="scheduleError" class="mt-1 text-[11px] text-destructive">{{ scheduleError }}</p>
              <p v-else class="mt-1 text-[11px] text-muted-foreground">
                {{ schedule ? scheduleWords(schedule) : 'Runs when you choose Run now.' }}
              </p>
            </div>

            <div class="space-y-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
              <p class="font-medium text-foreground">Example</p>
              <p>
                <span class="block break-all font-mono">{{ placeLabel(sourceStore, `${storageRoot}run1/a.fastq`) }}</span>
                <span class="block">
                  appears in Aruna as
                  <span class="break-all font-mono">{{ placeLabel(bucketName, 'run1/a.fastq') }}</span>
                  unless a file rule sorts it
                </span>
              </p>
            </div>
          </fieldset>

          <fieldset class="space-y-3 rounded-md border border-border p-3">
            <legend class="mb-0 px-1 text-xs font-semibold text-foreground">Aruna → your storage</legend>
            <p class="text-[11px] text-muted-foreground">
              New uploads to that Aruna folder are saved in your storage.
            </p>
            <p class="text-xs text-foreground">
              Uploads to <span class="break-all font-mono">{{ placeLabel(bucketName, bucketRoot) }}</span>
            </p>
            <div class="space-y-2">
              <p class="text-xs font-medium text-foreground">Save to</p>
              <p v-if="!writeElsewhere" class="text-[11px] text-muted-foreground">
                The same storage and folder
                (<span class="break-all font-mono">{{ placeLabel(sourceStore, storageRoot) }}</span>)
              </p>
              <label class="flex items-center gap-2 text-xs text-foreground">
                <Switch
                  :checked="writeElsewhere"
                  :disabled="isEdit"
                  aria-label="Save to a different place"
                  @update:checked="(v: boolean) => (writeElsewhere = v)"
                />
                Save to a different place
              </label>
              <div v-if="writeElsewhere" class="grid gap-3 sm:grid-cols-2">
                <div class="space-y-1">
                  <Select
                    :model-value="writeBackendId"
                    :options="backendOptions"
                    :disabled="isEdit"
                    placeholder="Choose a storage"
                    aria-label="Storage for new uploads"
                    @update:model-value="(v: string) => (writeBackendId = v)"
                  />
                  <p v-if="target" class="break-all text-[11px] text-muted-foreground">{{ storeLine(target) }}</p>
                </div>
                <div class="space-y-1">
                  <Input
                    v-model="writeFolder"
                    :disabled="isEdit"
                    aria-label="Folder for new uploads"
                    class="font-mono text-xs"
                    placeholder="uploads/"
                  />
                  <p class="text-[11px] text-muted-foreground">
                    {{ target && splitsBuckets(target) ? 'Start with the bucket, like lab-new/uploads/.' : `Leave empty to save at the top of ${target ? storeLabel(target) : 'your storage'}.` }}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label :for="`${uid}-pattern`" class="text-xs font-medium text-foreground">File name</label>
              <div class="mt-1 grid gap-2 sm:grid-cols-2">
                <Select
                  :model-value="patternChoice"
                  :options="PATTERN_OPTIONS"
                  :disabled="patternLocked || saving"
                  aria-label="File name preset"
                  @update:model-value="pickPattern"
                />
                <Input
                  :id="`${uid}-pattern`"
                  v-model="pattern"
                  :disabled="patternLocked || saving"
                  :invalid="patternError ? 'error' : undefined"
                  class="font-mono text-xs"
                />
              </div>
              <p v-if="patternError && !patternLocked" class="mt-1 text-[11px] text-destructive">{{ patternError }}</p>
              <p v-else-if="patternChanged" class="mt-1 text-[11px] text-muted-foreground">
                Only new uploads get the new name. Files already saved keep theirs.
              </p>
              <p v-else class="mt-1 text-[11px] text-muted-foreground">
                {dir} is the folder below the linked folder, {name} the file name, {id} the version ID.
              </p>
            </div>

            <div class="space-y-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
              <p class="font-medium text-foreground">Example</p>
              <p>
                <span class="block">
                  New upload
                  <span class="break-all font-mono">{{ placeLabel(bucketName, `${bucketRoot}run2/b.fastq`) }}</span>
                </span>
                <span class="block">is saved as <span class="break-all font-mono">{{ exampleUpload }}</span></span>
              </p>
            </div>

            <label v-if="!isEdit || movable" class="flex items-center gap-2 text-xs text-foreground">
              <Switch
                :checked="moveFiles"
                aria-label="Move files already in this folder"
                @update:checked="(v: boolean) => (moveFiles = v)"
              />
              Move files already in this folder
            </label>

            <div v-if="offerRename && renames" class="space-y-1.5 rounded-md border border-border px-3 py-2 text-xs" data-testid="rename-offer">
              <p class="font-medium text-foreground">Rename existing files</p>
              <p class="text-muted-foreground">
                <template v-if="renames.count">
                  {{ renames.count }}{{ renames.complete ? '' : '+' }} {{ renames.count === 1 ? 'file has' : 'files have' }} an older name.
                </template>
                <template v-else>Some files may have an older name.</template>
                Each gets a copy with the new name, then the old file is removed.
              </p>
              <ul class="space-y-0.5 font-mono text-[11px] text-muted-foreground">
                <li v-for="file in renames.files.slice(0, 3)" :key="file.from" class="break-all">{{ file.from }} → {{ file.to }}</li>
              </ul>
              <p v-if="renames.count > 3" class="text-[11px] text-muted-foreground">and {{ renames.count - 3 }} more</p>
              <p v-if="renaming" class="text-[11px] text-muted-foreground">Renaming files…</p>
              <Button v-else type="button" variant="outline" size="sm" :disabled="saving || writesDisabled" @click="rename">
                Rename files
              </Button>
            </div>

            <Notice>
              Moving files does not rename or delete them in your storage.
              <template v-if="offerRename">Old names are removed only when you choose Rename files.</template>
            </Notice>
          </fieldset>
          <p v-if="conflict" class="text-xs text-destructive">{{ conflict }}</p>
          <Notice v-if="submitError" tone="error">{{ submitError }}</Notice>
        </div>

        <DialogFooter>
          <template v-if="isEdit">
            <span v-if="confirmingDelete" class="mr-auto self-center text-xs text-foreground">
              Delete this link? Files stay in your storage.
            </span>
            <Button
              v-if="confirmingDelete"
              type="button"
              variant="destructive"
              :disabled="saving || writesDisabled"
              @click="remove"
            >
              Delete
            </Button>
            <Button
              v-else
              type="button"
              variant="ghost"
              class="mr-auto text-destructive"
              :disabled="saving || writesDisabled"
              @click="confirmingDelete = true"
            >
              Delete link
            </Button>
          </template>
          <DialogClose as-child><Button type="button" variant="outline">Cancel</Button></DialogClose>
          <Button
            type="submit"
            class="whitespace-nowrap"
            :disabled="submitDisabled"
            :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
          >
            {{ saving ? 'Saving…' : isEdit ? 'Save changes' : 'Link and run' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
