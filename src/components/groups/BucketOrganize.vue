<script setup lang="ts">
// The Organize tab of a linked bucket: only clean-up steps that have work are shown.
import { computed, ref, watch } from 'vue'
import JobProgress from '@/components/storage/JobProgress.vue'
import PagedList from '@/components/storage/PagedList.vue'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { isUnsupportedEndpoint, useAruna } from '@/composables/useAruna'
import { useCursorPage } from '@/composables/useCursorPage'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import {
  getImportRenames,
  previewDuplicates,
  startDuplicates,
  startImportRenames,
  type BackendImport,
  type DuplicateItem,
  type OrganizeJob,
  type RenamePlan,
} from '@/lib/api'
import { countWords } from '@/lib/bucketNaming'
import { copyKey, filesWord, organizeError, type ProgressJob } from '@/lib/organize'
import { moveRefusal } from '@/lib/storageRules'
import { formatBytes, formatNumber } from '@/lib/utils'

const props = defineProps<{
  groupId: string
  link: BackendImport
  /** The S3 bucket and folder, as the description shows it. */
  place: string
  job: ProgressJob | null
  /** The last step that ended; null while one runs or when none ran. */
  lastJob?: OrganizeJob | null
  controlling?: boolean
  /** Counts steps that ended, so the counts read again. */
  finished?: number
}>()
const emit = defineEmits<{
  (e: 'started'): void
  /** A rename was accepted. */
  (e: 'renaming'): void
  (e: 'control', action: 'pause' | 'resume' | 'abort'): void
}>()

const { apiBaseUrl, authToken, sessionEpoch } = useAruna()
const { writesDisabled } = useConnectivity()

const open = ref<'dup' | 'ren' | null>(null)
const busy = ref(false)
const error = ref<string | null>(null)
const copiesMissing = ref(false)
const renamesMissing = ref(false)
// Counts of the whole bucket, from first pages without a filter; null until known.
const copyAll = ref<{ total: number; complete: boolean } | null>(null)
const renameAll = ref<{ total: number; complete: boolean; plan?: RenamePlan } | null>(null)
let wholeRun = 0
let renameRun = 0

function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

// Only a first page without a filter sets the count the step acts on.
const copies = useCursorPage<DuplicateItem>(
  async (query) => {
    const link = props.link.import_id
    const whole = !query.filter && !query.after
    const mine = whole ? ++wholeRun : wholeRun
    const page = await previewDuplicates(props.groupId, link, query, client())
    if (whole && mine === wholeRun && link === props.link.import_id) {
      copyAll.value = { total: page.total, complete: page.complete }
    }
    return page
  },
  () => (copiesMissing.value = true),
)
const oldNames = useCursorPage<{ from: string; to: string; writable?: boolean }>(
  async (query) => {
    const link = props.link.import_id
    const whole = !query.filter && !query.after
    const mine = renameRun
    const found = await getImportRenames(props.groupId, link, client(), query)
    if (whole && mine === renameRun && link === props.link.import_id) {
      renameAll.value = { total: found.count, complete: found.complete, plan: found.plan }
    }
    return { items: found.files, total: found.count, complete: found.complete, next: found.next }
  },
  () => (renamesMissing.value = true),
)

const offered = (count: { total: number; complete: boolean } | null) => Boolean(count && (count.total > 0 || !count.complete))
const copyOffered = computed(() => offered(copyAll.value))
const renameOffered = computed(() => offered(renameAll.value))
// The first read of a big bucket takes a while; its count is unknown until then.
const counting = computed(() => renameAll.value === null && !renamesMissing.value && !oldNames.error.value)
const failed = computed(() => copies.error.value ?? oldNames.error.value)
const checking = computed(
  () => !failed.value && ((copyAll.value === null && !copiesMissing.value) || (renameAll.value === null && !renamesMissing.value)),
)
// Only checks that answered, and found nothing, mean nothing to clean up.
const nothing = computed(
  () => Boolean(copyAll.value && renameAll.value) && !failed.value && !copyOffered.value && !renameOffered.value && !props.job,
)
// A node without a check's route cannot say the bucket is clean.
const unavailable = computed(() => (copiesMissing.value || renamesMissing.value) && !copyOffered.value && !renameOffered.value)
// The duplicate count is of files that have copies; one file may have several.
const copyCount = computed(() => `${countWords(copyAll.value?.total ?? 0, copyAll.value?.complete ?? true)} with copies`)
const copyButton = computed(() => `Remove copies of ${countWords(copyAll.value?.total ?? 0, copyAll.value?.complete ?? true)}`)
const copySummary = computed(() => {
  const page = copies.page.value
  return page ? `Showing ${formatNumber(page.items.length)} · ${copyCount.value}` : undefined
})
const renaming = computed(() => props.job?.kind === 'rename')
const renamed = computed(() => (props.lastJob?.kind === 'rename' && props.lastJob.state === 'done' ? props.lastJob : null))
// With files that kept their old name, the way to open them replaces the count and Review.
const kept = computed(() => Boolean(renamed.value?.failed) && renameOffered.value && !renaming.value)
const renameCount = computed(() => countWords(renameAll.value?.total ?? 0, renameAll.value?.complete ?? true))
const copyLine = computed(() => {
  const plan = renameAll.value?.plan
  if (!plan?.streamed_files) return 'copy them inside your storage, not through Aruna'
  if (plan.streamed_files >= (renameAll.value?.total ?? 0)) return 'copy them through Aruna'
  return `copy ${filesWord(plan.streamed_files)} (${formatBytes(plan.streamed_bytes)}) through Aruna and the rest inside your storage`
})

// Reads both counts again; an open review shows its fresh first page.
function reload() {
  copies.reset()
  oldNames.reset()
  wholeRun++
  renameRun++
  copyAll.value = null
  renameAll.value = null
  copiesMissing.value = false
  renamesMissing.value = false
  void copies.load('')
  void oldNames.load('')
}

watch(
  () => [props.link.import_id, sessionEpoch.value],
  () => {
    open.value = null
    error.value = null
    reload()
  },
  { immediate: true },
)
watch(() => props.finished, reload)
watch(renaming, (on) => on && (open.value = null))

function review(step: 'dup' | 'ren') {
  open.value = open.value === step ? null : step
}

async function act(run: () => Promise<unknown>, started: () => void = () => emit('started')) {
  if (busy.value || props.job || writesDisabled.value) return
  busy.value = true
  error.value = null
  const epoch = sessionEpoch.value
  const link = props.link.import_id
  const same = () => epoch === sessionEpoch.value && link === props.link.import_id
  try {
    await run()
    if (same()) started()
  } catch (err) {
    if (!same()) return
    error.value = isUnsupportedEndpoint(err) ? 'This node cannot do this yet.' : (moveRefusal(err) ?? organizeError(err))
  } finally {
    busy.value = false
  }
}

const removeCopies = () => act(() => startDuplicates(props.groupId, props.link.import_id, client()))
const rename = () =>
  act(
    () => startImportRenames(props.groupId, props.link.import_id, client()),
    () => emit('renaming'),
  )
const offline = computed(() => (writesDisabled.value ? OFFLINE_WRITE_HINT : undefined))
const blocked = computed(() => busy.value || Boolean(props.job) || writesDisabled.value)
</script>

<template>
  <div class="grid gap-3">
    <p class="text-xs text-muted-foreground">
      Clean up the files in <span class="font-mono">{{ place }}</span>. Paths in Aruna stay the same.
    </p>
    <p v-if="checking" class="text-xs text-muted-foreground">Checking the bucket…</p>
    <p v-else-if="nothing" class="text-sm">Nothing to clean up.</p>
    <p v-else-if="unavailable && !failed" class="text-xs text-muted-foreground">This node cannot check this bucket yet.</p>
    <div v-if="job && job.kind !== 'duplicates' && job.kind !== 'rename'" class="rounded-md border border-border px-3 py-2.5">
      <JobProgress :job="job" :busy="controlling" @control="(action) => emit('control', action)" />
    </div>

    <div v-if="copyOffered || job?.kind === 'duplicates'" class="rounded-md border border-border px-3 py-2.5" data-testid="step-duplicates">
      <div class="flex items-center gap-2">
        <div class="min-w-0 flex-1">
          <div class="text-sm font-medium">Duplicate files</div>
          <p class="text-xs text-muted-foreground">Same content stored twice. The extra copy is deleted.</p>
        </div>
        <span v-if="copyOffered" class="text-xs text-muted-foreground">{{ copyCount }}</span>
        <Button v-if="copyOffered" variant="outline" size="sm" @click="review('dup')">Review…</Button>
      </div>
      <div v-if="open === 'dup'" class="mt-3">
        <PagedList
          :summary="copySummary"
          :total="copies.page.value?.total ?? 0"
          :complete="copies.page.value?.complete ?? true"
          :offset="copies.offset.value"
          :shown="copies.items.value.length"
          :filter="copies.filter.value"
          :busy="copies.busy.value"
          :has-next="copies.hasNext.value"
          :has-prev="copies.hasPrev.value"
          @next="copies.next()"
          @prev="copies.prev()"
          @filter="(value: string) => copies.load(value)"
        >
          <template #head>
            <div class="grid grid-cols-2 gap-3 text-[11px] uppercase tracking-wide text-muted-foreground">
              <span>Kept</span><span>Deleted</span>
            </div>
          </template>
          <li v-for="item in copies.items.value" :key="copyKey(item)" class="grid grid-cols-2 gap-3 px-3 py-1.5 font-mono">
            <span class="truncate" :title="item.kept.path">{{ item.kept.path }}</span>
            <span class="truncate text-destructive" :title="item.removed.map((file) => file.path).join(', ')">
              {{ item.removed.map((file) => file.path).join(', ') }}
            </span>
          </li>
        </PagedList>
        <div class="mt-2 flex justify-end gap-2">
          <Button variant="ghost" size="sm" @click="open = null">Cancel</Button>
          <Button variant="destructive" size="sm" :disabled="blocked" :title="offline" @click="removeCopies">
            {{ copyButton }}
          </Button>
        </div>
      </div>
      <JobProgress v-if="job?.kind === 'duplicates'" class="mt-3" :job="job" :busy="controlling" @control="(action) => emit('control', action)" />
    </div>

    <div v-if="renameOffered || counting || renaming || renamed" class="rounded-md border border-border px-3 py-2.5" data-testid="step-renames">
      <div class="flex items-center gap-2">
        <div class="min-w-0 flex-1">
          <div class="text-sm font-medium">Old file names</div>
          <p class="text-xs text-muted-foreground">Files with an older name style get the bucket's current style.</p>
        </div>
        <Spinner v-if="counting" show-label label="Counting files…" />
        <span v-else-if="renameOffered && !renaming && !kept" class="text-xs text-muted-foreground">{{ renameCount }}</span>
        <Button
          v-if="counting || renaming || (renameOffered && !kept)"
          variant="outline"
          size="sm"
          :disabled="counting || renaming"
          :title="renaming ? 'A rename is running' : undefined"
          @click="review('ren')"
        >
          Review…
        </Button>
      </div>
      <template v-if="renamed && !renaming">
        <p class="mt-2 text-sm">{{ filesWord(renamed.done) }} renamed.</p>
        <p v-if="renamed.failed" class="mt-1 flex items-center gap-1 text-xs text-destructive">
          {{ renamed.failed === 1 ? '1 file kept its old name.' : `${filesWord(renamed.failed)} kept their old name.` }}
          <Button v-if="renameOffered" variant="link" size="sm" class="h-auto p-0 text-xs" @click="review('ren')">Show them</Button>
        </p>
      </template>
      <div v-if="open === 'ren' && !renaming" class="mt-3">
        <div v-if="renameAll?.plan" class="mb-2 rounded-md bg-muted px-3 py-2.5" data-testid="rename-plan">
          <p class="text-sm font-medium">This rename will</p>
          <ul class="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
            <li>
              rename <b class="font-medium text-foreground">{{ filesWord(renameAll.total) }}</b>
              ({{ formatBytes(renameAll.plan.bytes) }}) in your storage
            </li>
            <li>{{ copyLine }}</li>
            <li v-if="renameAll.plan.unchanged_files">leave {{ filesWord(renameAll.plan.unchanged_files) }} as they are</li>
          </ul>
          <p class="mt-2 text-xs text-muted-foreground">
            Large renames can take hours. They run on the server, so you can close this window.
          </p>
        </div>
        <PagedList
          :total="oldNames.page.value?.total ?? 0"
          :complete="oldNames.page.value?.complete ?? true"
          :offset="oldNames.offset.value"
          :shown="oldNames.items.value.length"
          :filter="oldNames.filter.value"
          :busy="oldNames.busy.value"
          :has-next="oldNames.hasNext.value"
          :has-prev="oldNames.hasPrev.value"
          @next="oldNames.next()"
          @prev="oldNames.prev()"
          @filter="(value: string) => oldNames.load(value)"
        >
          <template #head>
            <div class="grid grid-cols-2 gap-3 text-[11px] uppercase tracking-wide text-muted-foreground">
              <span>Old name</span><span>New name</span>
            </div>
          </template>
          <li v-for="file in oldNames.items.value" :key="file.from" class="grid grid-cols-2 gap-3 px-3 py-1.5 font-mono">
            <span class="truncate" :title="file.from">{{ file.from }}</span>
            <span class="truncate" :title="file.to">
              {{ file.to }}<span v-if="file.writable === false" class="font-sans text-muted-foreground"> (cannot rename)</span>
            </span>
          </li>
        </PagedList>
        <div class="mt-2 flex justify-end gap-2">
          <Button variant="ghost" size="sm" @click="open = null">Cancel</Button>
          <Button size="sm" :disabled="blocked" :title="offline" @click="rename">Rename {{ renameCount }}</Button>
        </div>
      </div>
      <JobProgress v-if="job?.kind === 'rename'" class="mt-3" :job="job" :busy="controlling" @control="(action) => emit('control', action)" />
    </div>

    <Notice v-if="error || copies.error.value || oldNames.error.value" tone="error">
      {{ error ?? copies.error.value ?? oldNames.error.value }}
    </Notice>
  </div>
</template>
