<script setup lang="ts">
// The group's storage in one list: Aruna storage, then each storage the group added with
// its rules. The default rule sends all buckets to one bucket; linked rules work both ways.
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Progress from '@/components/ui/Progress.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import StorageBackendDialog from '@/components/groups/StorageBackendDialog.vue'
import LinkedFolderDialog from '@/components/groups/LinkedFolderDialog.vue'
import DefaultRuleDialog from '@/components/groups/DefaultRuleDialog.vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { FolderInput, Play, Plus } from '@lucide/vue'
import { isUnsupportedEndpoint, useAruna } from '@/composables/useAruna'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import {
  ApiError,
  getBucketMove,
  listBackendImports,
  listGroupDataPaths,
  runBackendImport,
  startBucketMove,
  type BackendImport,
  type BucketMoveResponse,
  type GroupBackendResponse,
  type RoutingTarget,
} from '@/lib/api'
import {
  arunaPlace,
  bucketError,
  bucketTitle,
  defaultBucket,
  moveOffer,
  moveRefusal,
  moveText,
  moveView,
  rememberMoves,
  type AskedMove,
  type MoveTotals,
  runActive,
  runText,
  splitPath,
  storageLine,
  storagePlace,
} from '@/lib/storageRules'
import { writesElsewhere } from '@/lib/linkedFolders'
import { errorMessage } from '@/lib/utils'

const props = defineProps<{ groupId: string; groupName: string; canAdmin: boolean }>()
const emit = defineEmits<{
  (e: 'count', count: number): void
  (e: 'backends', backends: GroupBackendResponse[]): void
}>()

const {
  apiBaseUrl,
  authToken,
  sessionEpoch,
  listGroupBackends,
  getGroupRouting,
  putGroupRouting,
  disableGroupBackend,
  enableGroupBackend,
  saving,
} = useAruna()
const { writesDisabled } = useConnectivity()

const backends = ref<GroupBackendResponse[] | null>(null)
const links = ref<BackendImport[]>([])
const target = ref<RoutingTarget | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
const hidden = ref(false)
const actionError = ref<string | null>(null)
const busyId = ref<string | null>(null)
const expandedId = ref<string | null>(null)

const storageDialog = ref(false)
const editingStorage = ref<GroupBackendResponse | null>(null)
const linkDialog = ref(false)
const editingLink = ref<BackendImport | null>(null)
const linkStorage = ref<string | null>(null)
const defaultDialog = ref(false)
const defaultStorage = ref<GroupBackendResponse | null>(null)
const arunaConfirm = ref(false)
const removingId = ref<string | null>(null)
// Move counts by "bucket\nprefix"; a node without the routes leaves them empty.
const moves = ref<Record<string, AskedMove>>({})
const groupBuckets = ref<string[]>([])
// A confirmation keeps the group, client and session it was made for.
interface MoveAsk {
  pairs: [string, string][]
  place: string
  groupId: string
  epoch: number
  asked: ReturnType<typeof client>
}
const moveAsk = ref<MoveAsk | null>(null)

const defaultId = computed(() => target.value?.backend_id ?? null)
const defaultName = computed(
  () => backends.value?.find((backend) => backend.backend_id === defaultId.value)?.name ?? '',
)

function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

let pollTimer: ReturnType<typeof setTimeout> | undefined
let disposed = false
function clearPoll() {
  if (pollTimer !== undefined) clearTimeout(pollTimer)
  pollTimer = undefined
}

function schedulePoll() {
  clearPoll()
  const importing = links.value.some((link) => runActive(link.last_run))
  if (!disposed && (importing || moveView(Object.values(moves.value)).running)) {
    pollTimer = setTimeout(() => void load(), 3_000)
  }
}

function moveKey(bucket: string, prefix: string): string {
  return `${bucket}\n${prefix}`
}

// Buckets of the group on this node, from the permission paths ".../{bucket}/".
async function listGroupBuckets(groupId: string, asked: ReturnType<typeof client>): Promise<string[]> {
  const names = new Set<string>()
  let continuationToken: string | undefined
  do {
    const page = await listGroupDataPaths(groupId, { limit: 100, continuationToken }, asked)
    for (const entry of page.entries) {
      const name = entry.permission_path.split('/').filter(Boolean).pop()
      if (name) names.add(name)
    }
    continuationToken = page.continuation_token
  } while (continuationToken)
  return [...names]
}

const moveTotals: MoveTotals = new Map()

async function loadMoves() {
  const seq = loadSeq
  const asked = client()
  // A failed read keeps what was known, so a running move stays in view.
  let buckets = groupBuckets.value
  try {
    buckets = await listGroupBuckets(props.groupId, asked)
  } catch {
    // Keep the last known buckets.
  }
  if (seq !== loadSeq) return
  const pairs: [string, string][] = [
    ...links.value.map((link): [string, string] => [link.bucket, link.key_prefix]),
    ...buckets.map((bucket): [string, string] => [bucket, '']),
  ]
  const answers = await Promise.allSettled(pairs.map(([bucket, prefix]) => getBucketMove(bucket, prefix, asked)))
  if (seq !== loadSeq) return
  const next: Record<string, AskedMove> = {}
  answers.forEach((answer, index) => {
    const key = moveKey(...pairs[index])
    const known = answer.status === 'fulfilled' ? { ...answer.value, asked: pairs[index][1] } : moves.value[key]
    if (known) next[key] = known
  })
  groupBuckets.value = buckets
  rememberMoves(moveTotals, Object.values(next))
  moves.value = next
}

// Only the latest load for the current group and session writes state.
let loadSeq = 0
async function load() {
  const seq = ++loadSeq
  const epoch = sessionEpoch.value
  const current = () => seq === loadSeq && epoch === sessionEpoch.value
  loading.value = true
  loadError.value = null
  try {
    const [list, routing, imports] = await Promise.all([
      listGroupBackends(props.groupId),
      getGroupRouting(props.groupId),
      // A node without linked rules still shows its storages.
      listBackendImports(props.groupId, client()).catch((err) => {
        if (isUnsupportedEndpoint(err)) return []
        throw err
      }),
    ])
    if (!current()) return
    backends.value = list.backends
    target.value = routing.default_target ?? null
    links.value = imports
    emit('count', list.backends.length)
    emit('backends', list.backends)
    void loadMoves().then(() => {
      if (current()) schedulePoll()
    })
  } catch (err) {
    if (!current()) return
    if (err instanceof ApiError && (err.status === 403 || err.status === 401)) hidden.value = true
    else if (backends.value && moveView(Object.values(moves.value)).running) schedulePoll()
    else loadError.value = errorMessage(err)
  } finally {
    if (current()) loading.value = false
  }
}

watch(
  [() => props.groupId, sessionEpoch],
  () => {
    backends.value = null
    links.value = []
    moveAsk.value = null
    moves.value = {}
    groupBuckets.value = []
    target.value = null
    hidden.value = false
    actionError.value = null
    expandedId.value = null
    clearPoll()
    void load()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  disposed = true
  clearPoll()
})

// Where new uploads of a link go when that is not its own source folder.
function writePlace(link: BackendImport): string {
  const id = link.write_backend_id || link.backend_id
  const target = backends.value?.find((backend) => backend.backend_id === id)
  const place = storagePlace(target, link.write_prefix ?? link.backend_prefix)
  return target ? `${target.name}: ${place}` : place
}

function linksOf(backend: GroupBackendResponse): BackendImport[] {
  return links.value.filter((link) => link.backend_id === backend.backend_id)
}

function openStorage(backend: GroupBackendResponse | null) {
  editingStorage.value = backend
  storageDialog.value = true
}

function openLink(backend: GroupBackendResponse, link: BackendImport | null) {
  linkStorage.value = backend.backend_id
  editingLink.value = link
  linkDialog.value = true
}

function openDefault(backend: GroupBackendResponse) {
  defaultStorage.value = backend
  defaultDialog.value = true
}

async function useArunaStorage() {
  actionError.value = null
  try {
    await putGroupRouting(props.groupId, null)
    arunaConfirm.value = false
    await load()
  } catch (err) {
    actionError.value = errorMessage(err)
  }
}

async function run(link: BackendImport) {
  if (busyId.value) return
  actionError.value = null
  busyId.value = link.import_id
  try {
    await runBackendImport(props.groupId, link.import_id, client())
  } catch (err) {
    const running = err instanceof ApiError && err.status === 409
    if (!running) actionError.value = errorMessage(err)
  } finally {
    busyId.value = null
    await load()
  }
}

function found(bucket: string, prefix: string): BucketMoveResponse[] {
  const move = moves.value[moveKey(bucket, prefix)]
  return move ? [move] : []
}
const defaultMove = computed(() =>
  moveView(
    groupBuckets.value.flatMap((bucket) => found(bucket, '')),
    '',
    moveTotals,
  ),
)
function linkMove(link: BackendImport) {
  return moveView(found(link.bucket, link.key_prefix), undefined, moveTotals)
}
// Only buckets that have something to move are asked.
const defaultPairs = computed(() =>
  groupBuckets.value
    .filter((bucket) => moveOffer(moveView(found(bucket, ''))))
    .map((bucket): [string, string] => [bucket, '']),
)

async function startMove() {
  const ask = moveAsk.value
  if (!ask || busyId.value || writesDisabled.value) return
  actionError.value = null
  busyId.value = 'move'
  const stale = () => disposed || ask.epoch !== sessionEpoch.value || ask.groupId !== props.groupId
  try {
    for (const [bucket, prefix] of ask.pairs) {
      if (stale() || writesDisabled.value) break
      await startBucketMove(bucket, prefix, ask.asked)
    }
    moveAsk.value = null
  } catch (err) {
    if (!stale()) actionError.value = moveRefusal(err) ?? errorMessage(err)
    moveAsk.value = null
  } finally {
    busyId.value = null
    await load()
  }
}

async function remove(backend: GroupBackendResponse) {
  if (writesDisabled.value) return
  actionError.value = null
  try {
    await disableGroupBackend(props.groupId, backend.backend_id)
    removingId.value = null
    await load()
  } catch (err) {
    actionError.value = errorMessage(err)
  }
}

async function enable(backend: GroupBackendResponse) {
  actionError.value = null
  try {
    await enableGroupBackend(props.groupId, backend.backend_id)
    await load()
  } catch (err) {
    actionError.value = errorMessage(err)
  }
}

function askMove(pairs: [string, string][], place: string) {
  moveAsk.value = { pairs, place, groupId: props.groupId, epoch: sessionEpoch.value, asked: client() }
}

async function onDefaultSaved(move?: boolean) {
  if (!move) return load()
  const groupId = props.groupId
  const epoch = sessionEpoch.value
  const asked = client()
  const same = () => !disposed && groupId === props.groupId && epoch === sessionEpoch.value
  await load()
  if (!same() || writesDisabled.value) return
  // The new rules decide what is misplaced now, so ask again before moving.
  const buckets = groupBuckets.value
  const answers = await Promise.allSettled(buckets.map((bucket) => getBucketMove(bucket, '', asked)))
  if (!same() || writesDisabled.value) return
  const pairs = answers.flatMap((answer, index): [string, string][] =>
    answer.status === 'fulfilled' && moveOffer(moveView([answer.value])) ? [[buckets[index], '']] : [],
  )
  if (!pairs.length) return
  moveAsk.value = { pairs, place: 'all buckets', groupId, epoch, asked }
  await startMove()
}

function onLinkSaved(runError?: string) {
  actionError.value = runError ?? null
  void load()
}

const offline = computed(() => (writesDisabled.value ? OFFLINE_WRITE_HINT : undefined))
// Fixed columns: kind, in Aruna, arrow, in storage, icon, last run, actions.
const GRID = 'grid grid-cols-[4.5rem_minmax(0,1.3fr)_1.25rem_minmax(0,1.2fr)_1.25rem_minmax(0,1fr)_8.5rem] items-center gap-2'
</script>

<template>
  <div class="px-5 py-4">
    <div class="flex items-center gap-2">
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Storage</h2>
      <span class="flex-1" />
      <Button
        v-if="canAdmin && !hidden"
        variant="outline"
        size="sm"
        :disabled="writesDisabled"
        :title="offline"
        @click="openStorage(null)"
      >
        <Plus class="h-3.5 w-3.5" /> Add your storage
      </Button>
    </div>
    <p class="mt-1 text-xs text-muted-foreground">
      Files are kept in Aruna's own storage or in storage you add, like your own S3. New uploads follow
      the default rule unless a linked rule covers them.
    </p>

    <div v-if="hidden" class="mt-3 text-xs text-muted-foreground">Storage is only visible to group admins.</div>
    <Skeleton v-else-if="loading && !backends" class="mt-3 h-24" />
    <ErrorPanel v-else-if="loadError" class="mt-3" :message="loadError" @retry="load" />
    <template v-else-if="backends">
      <section class="mt-3 rounded-lg border border-border" data-testid="aruna-storage">
        <div class="flex items-center gap-2 px-3 py-2.5">
          <div class="min-w-0">
            <span class="text-sm font-semibold text-foreground">Aruna storage</span>
            <Badge size="sm" variant="secondary" class="ml-1.5 uppercase">built in</Badge>
            <p class="mt-0.5 text-xs text-muted-foreground">
              Managed by Aruna on this node. No setup needed. Gets new uploads when your storage has no default rule.
            </p>
          </div>
          <span class="flex-1" />
          <Button
            v-if="canAdmin && target"
            variant="outline"
            size="sm"
            :disabled="writesDisabled"
            :title="offline"
            @click="arunaConfirm = true"
          >
            Use as default
          </Button>
          <template v-else-if="!target">
            <Button
              v-if="canAdmin && moveOffer(defaultMove)"
              variant="ghost"
              size="sm"
              class="h-6 px-2 text-aruna-navy dark:text-foreground"
              :disabled="writesDisabled || busyId !== null || defaultMove.running"
              :title="offline ?? 'Move files'"
              aria-label="Move files"
              @click="askMove(defaultPairs, 'all buckets')"
            >
              <FolderInput class="h-3.5 w-3.5" />
            </Button>
            <Badge size="sm" variant="default" class="uppercase">default</Badge>
          </template>
        </div>
        <div v-if="!target && defaultMove.running" class="px-3 pb-2.5 text-[11px] text-muted-foreground" data-testid="move-line">
          {{ moveText(defaultMove) }}
          <Progress
            :value="defaultMove.done"
            :max="defaultMove.done + defaultMove.misplaced"
            :warn="101"
            :critical="101"
            label="Moving files"
            bar-class="bg-primary"
            class="mt-0.5 h-1"
          />
        </div>
      </section>

      <section
        v-for="backend in backends"
        :key="backend.backend_id"
        class="mt-3 rounded-lg border border-border"
        :data-testid="`storage-${backend.backend_id}`"
      >
        <div class="flex items-center gap-2 px-3 py-2.5">
          <div class="min-w-0">
            <span class="text-sm font-semibold text-foreground">{{ backend.name }}</span>
            <Badge size="sm" variant="secondary" class="ml-1.5 uppercase">your storage</Badge>
            <Badge v-if="backend.disabled" size="sm" variant="warn" class="ml-1 uppercase">removed</Badge>
            <p class="mt-0.5 truncate text-xs text-muted-foreground">{{ storageLine(backend) }}</p>
          </div>
          <span class="flex-1" />
          <template v-if="canAdmin">
            <template v-if="removingId === backend.backend_id">
              <span class="text-xs text-foreground">Remove? New uploads stop going here. Files stay readable.</span>
              <Button
                variant="destructive"
                size="sm"
                :disabled="saving || writesDisabled"
                :title="offline"
                @click="remove(backend)"
              >
                Remove
              </Button>
              <Button variant="ghost" size="sm" @click="removingId = null">Cancel</Button>
            </template>
            <template v-else>
              <Button
                v-if="!backend.disabled && defaultId !== backend.backend_id"
                variant="ghost"
                size="sm"
                class="text-aruna-navy dark:text-foreground"
                :disabled="writesDisabled"
                :title="offline"
                @click="openDefault(backend)"
              >
                Use as default
              </Button>
              <Button
                variant="ghost"
                size="sm"
                class="text-aruna-navy dark:text-foreground"
                :disabled="writesDisabled"
                :title="offline"
                @click="openStorage(backend)"
              >
                Edit
              </Button>
              <Button
                v-if="backend.disabled"
                variant="ghost"
                size="sm"
                class="text-aruna-navy dark:text-foreground"
                :disabled="writesDisabled"
                :title="offline"
                @click="enable(backend)"
              >
                Enable
              </Button>
              <Button
                v-else
                variant="ghost"
                size="sm"
                class="text-aruna-navy dark:text-foreground"
                :disabled="writesDisabled"
                :title="offline"
                @click="removingId = backend.backend_id"
              >
                Remove
              </Button>
            </template>
          </template>
        </div>

        <div class="rounded-b-lg border-t border-border bg-muted/30 px-3 pb-2.5 pt-1.5 text-xs">
          <div
            v-if="defaultId === backend.backend_id || linksOf(backend).length"
            :class="[GRID, 'border-b border-border py-1 text-[11px] uppercase tracking-wide text-muted-foreground']"
          >
            <span />
            <span class="truncate">In Aruna</span>
            <span />
            <span class="truncate">In {{ backend.name }}</span>
            <span />
            <span class="truncate">Last run</span>
            <span />
          </div>

          <div
            v-if="defaultId === backend.backend_id"
            :class="[GRID, 'border-b border-dashed border-border py-1.5']"
            data-testid="default-row"
          >
            <Badge size="sm" class="justify-self-start bg-aruna-navy uppercase text-white ring-0">default</Badge>
            <span class="truncate">All buckets</span>
            <span class="text-muted-foreground">→</span>
            <span class="truncate font-mono">{{ defaultBucket(backend) }}</span>
            <span
              v-if="bucketTitle(backend, defaultBucket(backend) ?? '')"
              class="font-bold text-emerald-700 dark:text-emerald-400"
              :title="bucketTitle(backend, defaultBucket(backend) ?? '') ?? undefined"
            >✓</span>
            <span v-else />
            <span />
            <span class="flex justify-end gap-0.5">
              <span v-if="canAdmin" class="inline-block h-6 w-[1.875rem]" aria-hidden="true" />
              <Button
                v-if="canAdmin && moveOffer(defaultMove)"
                variant="ghost"
                size="sm"
                class="h-6 px-2 text-aruna-navy dark:text-foreground"
                :disabled="writesDisabled || busyId !== null || defaultMove.running"
                :title="offline ?? 'Move files'"
                aria-label="Move files"
                @click="askMove(defaultPairs, 'all buckets')"
              >
                <FolderInput class="h-3.5 w-3.5" />
              </Button>
              <span v-else-if="canAdmin" class="inline-block h-6 w-[1.875rem]" aria-hidden="true" />
              <Button
                v-if="canAdmin"
                variant="ghost"
                size="sm"
                class="h-6 px-2 text-aruna-navy dark:text-foreground"
                :disabled="writesDisabled"
                :title="offline"
                @click="openDefault(backend)"
              >
                Edit
              </Button>
            </span>
          </div>
          <div v-if="defaultMove.running" class="py-0.5 pl-[5rem] text-[11px] text-muted-foreground" data-testid="move-line">
            {{ moveText(defaultMove) }}
            <Progress
              :value="defaultMove.done"
              :max="defaultMove.done + defaultMove.misplaced"
              :warn="101"
              :critical="101"
              label="Moving files"
              bar-class="bg-primary"
              class="mt-0.5 h-1"
            />
          </div>

          <template v-for="link in linksOf(backend)" :key="link.import_id">
            <div :class="[GRID, 'border-b border-dashed border-border py-1.5']" data-testid="linked-row">
              <Badge size="sm" variant="secondary" class="justify-self-start uppercase">linked</Badge>
              <span class="truncate font-mono" :title="arunaPlace(link)">{{ arunaPlace(link) }}</span>
              <span
                v-if="writesElsewhere(link)"
                class="text-muted-foreground"
                title="Files come from here; new uploads go elsewhere"
              >←</span>
              <span v-else class="text-muted-foreground">⇆</span>
              <span class="truncate font-mono" :title="storagePlace(backend, link.backend_prefix)">
                {{ storagePlace(backend, link.backend_prefix) }}
              </span>
              <span
                v-if="bucketError(link.last_run)"
                class="font-bold text-destructive"
                :title="bucketError(link.last_run) ?? undefined"
              >✗</span>
              <span
                v-else-if="bucketTitle(backend, splitPath(backend, link.backend_prefix).bucket)"
                class="font-bold text-emerald-700 dark:text-emerald-400"
                :title="bucketTitle(backend, splitPath(backend, link.backend_prefix).bucket) ?? undefined"
              >✓</span>
              <span v-else />
              <span
                class="truncate"
                :class="{
                  'text-muted-foreground': runText(link.last_run).tone === 'muted',
                  'text-destructive': runText(link.last_run).tone === 'failed',
                  'text-primary': runText(link.last_run).tone === 'active',
                }"
              >
                <button
                  v-if="runText(link.last_run).failures"
                  type="button"
                  class="underline"
                  @click="expandedId = expandedId === link.import_id ? null : link.import_id"
                >
                  {{ runText(link.last_run).text }}
                </button>
                <template v-else>{{ runText(link.last_run).text }}</template>
              </span>
              <span v-if="canAdmin" class="flex justify-end gap-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-6 px-2 text-aruna-navy dark:text-foreground"
                  :disabled="writesDisabled || busyId !== null || runActive(link.last_run)"
                  :title="offline ?? 'Run now'"
                  aria-label="Run now"
                  @click="run(link)"
                >
                  <Play class="h-3.5 w-3.5" />
                </Button>
                <Button
                  v-if="moveOffer(linkMove(link))"
                  variant="ghost"
                  size="sm"
                  class="h-6 px-2 text-aruna-navy dark:text-foreground"
                  :disabled="writesDisabled || busyId !== null || linkMove(link).running"
                  :title="offline ?? 'Move files'"
                  aria-label="Move files"
                  @click="askMove([[link.bucket, link.key_prefix]], arunaPlace(link))"
                >
                  <FolderInput class="h-3.5 w-3.5" />
                </Button>
                <span v-else class="inline-block h-6 w-[1.875rem]" aria-hidden="true" />
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-6 px-2 text-aruna-navy dark:text-foreground"
                  :disabled="writesDisabled"
                  :title="offline"
                  @click="openLink(backend, link)"
                >
                  Edit
                </Button>
              </span>
              <span v-else />
            </div>
            <p
              v-if="writesElsewhere(link)"
              class="truncate py-0.5 pl-[5rem] text-[11px] text-muted-foreground"
              data-testid="write-line"
            >
              New uploads go to <span class="font-mono">{{ writePlace(link) }}</span>
            </p>
            <div v-if="linkMove(link).running" class="py-0.5 pl-[5rem] text-[11px] text-muted-foreground" data-testid="move-line">
              {{ moveText(linkMove(link)) }}
              <Progress
                :value="linkMove(link).done"
                :max="linkMove(link).done + linkMove(link).misplaced"
                :warn="101"
                :critical="101"
                label="Moving files"
                bar-class="bg-primary"
                class="mt-0.5 h-1"
              />
            </div>
            <ul
              v-if="expandedId === link.import_id && link.last_run"
              class="space-y-0.5 py-1 pl-[5rem] text-[11px] text-muted-foreground"
            >
              <li v-for="failure in link.last_run.errors" :key="failure.key" class="truncate">
                <span class="font-mono">{{ failure.key }}</span>: {{ failure.error }}
              </li>
            </ul>
          </template>

          <Button
            v-if="canAdmin && !backend.disabled"
            variant="outline"
            size="sm"
            class="mt-2"
            :disabled="writesDisabled"
            :title="offline"
            @click="openLink(backend, null)"
          >
            <Plus class="h-3.5 w-3.5" /> Link a bucket
          </Button>
        </div>
      </section>
      <p v-if="actionError" class="mt-2 text-xs text-destructive">{{ actionError }}</p>
    </template>

    <StorageBackendDialog
      v-model:open="storageDialog"
      :group-id="props.groupId"
      :backend="editingStorage"
      @saved="load"
    />
    <LinkedFolderDialog
      v-model:open="linkDialog"
      :group-id="props.groupId"
      :backends="backends ?? []"
      :link="editingLink"
      :links="links"
      :storage-id="linkStorage"
      :movable="editingLink ? moveOffer(linkMove(editingLink)) : false"
      @saved="onLinkSaved"
    />
    <DefaultRuleDialog
      v-model:open="defaultDialog"
      :group-id="props.groupId"
      :group-name="props.groupName"
      :backend="defaultStorage"
      :links="links"
      :has-buckets="groupBuckets.length > 0"
      @saved="onDefaultSaved"
    />
    <Dialog :open="moveAsk !== null" @update:open="(v: boolean) => { if (!v) moveAsk = null }">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Move files?</DialogTitle>
          <DialogDescription>
            Files in {{ moveAsk?.place }} move to the storage the rules choose now. This runs in the background.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose as-child><Button type="button" variant="outline">Cancel</Button></DialogClose>
          <Button :disabled="busyId !== null || writesDisabled" @click="startMove">Move files</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog :open="arunaConfirm" @update:open="(v: boolean) => (arunaConfirm = v)">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Use Aruna storage as default?</DialogTitle>
          <DialogDescription>
            New uploads then go to Aruna storage again. The default rule of {{ defaultName }} is removed.
            Files already in {{ defaultName }} stay there.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose as-child><Button type="button" variant="outline">Cancel</Button></DialogClose>
          <Button :disabled="saving || writesDisabled" @click="useArunaStorage">Use as default</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
