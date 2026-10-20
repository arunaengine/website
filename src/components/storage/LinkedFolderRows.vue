<script setup lang="ts">
// The linked folders of this bucket, in the row style of the sync list. Only
// group admins may read them; for everyone else the rows stay away.
import { computed, ref, watch } from 'vue'
import LinkedFolderDialog from '@/components/groups/LinkedFolderDialog.vue'
import FileRulesDialog from '@/components/storage/FileRulesDialog.vue'
import RenameFolderDialog from '@/components/storage/RenameFolderDialog.vue'
import Badge from '@/components/ui/Badge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import IconButton from '@/components/ui/IconButton.vue'
import ListSkeleton from '@/components/ui/ListSkeleton.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import { isUnsupportedEndpoint, useAruna } from '@/composables/useAruna'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import {
  ApiError,
  listBackendImports,
  runBackendImport,
  type BackendImport,
  type GroupBackendResponse,
} from '@/lib/api'
import { RUN_HINT, scheduleWords } from '@/lib/linkedFolders'
import { stateTone } from '@/lib/stateBadge'
import { errorMessage, relativeTime } from '@/lib/utils'
import { ArrowLeftRight, FolderInput, ListFilter, Play, SlidersHorizontal } from '@lucide/vue'

const props = defineProps<{ bucket: string; groupId: string | null; quiet?: boolean }>()
// A count of null: the list was refused or failed, so it says nothing about the bucket.
const emit = defineEmits<{
  (e: 'count', count: number | null): void
  (e: 'available', value: boolean): void
}>()

const { apiBaseUrl, authToken, sessionEpoch, listGroupBackends } = useAruna()
const { writesDisabled } = useConnectivity()

const links = ref<BackendImport[]>([])
const backends = ref<GroupBackendResponse[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const refused = ref(false)
const runningId = ref<string | null>(null)
const rowError = ref<Record<string, string>>({})
const dialogOpen = ref(false)
const editing = ref<BackendImport | null>(null)
const rulesOpen = ref(false)
const renameOpen = ref(false)
const picked = ref<BackendImport | null>(null)
let requestId = 0

function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

async function load() {
  const id = ++requestId
  const groupId = props.groupId
  links.value = []
  backends.value = []
  rowError.value = {}
  error.value = null
  refused.value = !groupId
  if (!groupId) {
    emit('available', false)
    emit('count', null)
    return
  }
  loading.value = true
  try {
    const [listed, all] = await Promise.all([
      listGroupBackends(groupId),
      listBackendImports(groupId, client()).catch((err) => {
        if (isUnsupportedEndpoint(err)) return []
        throw err
      }),
    ])
    if (id !== requestId) return
    backends.value = listed.backends
    links.value = all
  } catch (err) {
    if (id !== requestId) return
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) refused.value = true
    else error.value = errorMessage(err)
  } finally {
    if (id === requestId) {
      loading.value = false
      emit('available', !refused.value)
      emit('count', refused.value || error.value ? null : rows.value.length)
    }
  }
}

const rows = computed(() => links.value.filter((link) => link.bucket === props.bucket))
const state = computed(() => {
  if (loading.value && !rows.value.length) return 'loading'
  if (error.value) return 'error'
  return rows.value.length ? 'ready' : 'empty'
})

// Another account or API base answers for other storage, so the rows start over.
watch(
  () => [props.bucket, props.groupId, sessionEpoch.value],
  () => {
    dialogOpen.value = false
    rulesOpen.value = false
    renameOpen.value = false
    editing.value = null
    void load()
  },
  { immediate: true },
)

function storageName(link: BackendImport): string {
  return backends.value.find((backend) => backend.backend_id === link.backend_id)?.name ?? 'Storage'
}

async function run(link: BackendImport) {
  if (!props.groupId || runningId.value || writesDisabled.value) return
  const epoch = sessionEpoch.value
  runningId.value = link.import_id
  rowError.value = { ...rowError.value, [link.import_id]: '' }
  try {
    await runBackendImport(props.groupId, link.import_id, client())
    await load()
  } catch (err) {
    if (epoch !== sessionEpoch.value) return
    const message = err instanceof ApiError && err.status === 409 ? 'A run is still going.' : errorMessage(err)
    rowError.value = { ...rowError.value, [link.import_id]: message }
  } finally {
    runningId.value = null
  }
}

function openRules(link: BackendImport) {
  picked.value = link
  rulesOpen.value = true
}

function openRename(link: BackendImport) {
  picked.value = link
  renameOpen.value = true
}

function open(link: BackendImport | null) {
  editing.value = link
  dialogOpen.value = true
}

defineExpose({ open })
</script>

<template>
  <p v-if="refused" class="surface px-5 py-3.5 text-xs text-muted-foreground">
    Only group admins can see the linked folders of this bucket.
  </p>
  <template v-else>
    <ErrorPanel v-if="state === 'error'" :message="error ?? ''" @retry="load" />
    <template v-else-if="state === 'empty'">
      <EmptyState
        v-if="!quiet"
        title="No linked folder fills this bucket."
        description="A linked folder keeps a folder of your own storage and this bucket the same."
      />
    </template>
    <div v-else class="surface overflow-hidden">
      <ListSkeleton v-if="state === 'loading'" bare :rows="2" />
      <ul v-else class="divide-y divide-border">
        <li v-for="link in rows" :key="link.import_id" class="px-5 py-3.5">
          <div class="flex items-center gap-2 text-xs">
            <StatusDot
              :tone="stateTone(link.last_run?.state ?? 'queued')"
              :label="link.last_run?.state ?? 'not run yet'"
            />
            <Badge variant="secondary" size="sm" class="shrink-0">Linked folder</Badge>
            <Badge variant="outline" size="sm" class="shrink-0">{{ scheduleWords(link.schedule) }}</Badge>
            <ArrowLeftRight class="size-3.5 shrink-0 text-muted-foreground" aria-label="with" />
            <Badge variant="outline" size="sm" class="shrink-0">{{ storageName(link) }}</Badge>
            <span class="min-w-0 flex-1 truncate font-mono" :title="link.backend_prefix">{{ link.backend_prefix || '/' }}</span>
            <span
              v-if="link.last_run"
              class="flex shrink-0 items-center gap-3 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground"
            >
              <span>last run {{ relativeTime(link.last_run.started_at) }}</span>
              <span>{{ link.last_run.imported }} new {{ link.last_run.imported === 1 ? 'file' : 'files' }}</span>
            </span>
          </div>
          <div class="mt-2 flex items-center justify-end gap-2">
            <span class="mr-auto text-[11px] text-muted-foreground">
              Keeps a folder of your own storage and
              <span class="font-mono">{{ bucket }}/{{ link.key_prefix }}</span> the same.
            </span>
            <IconButton
              :label="RUN_HINT"
              :disabled="runningId !== null"
              :disabled-reason="writesDisabled ? OFFLINE_WRITE_HINT : null"
              @click="run(link)"
            >
              <Play class="size-3.5" />
            </IconButton>
            <IconButton label="Sort new files" @click="openRules(link)">
              <ListFilter class="size-3.5" />
            </IconButton>
            <IconButton
              label="Rename a folder"
              :disabled="writesDisabled"
              :disabled-reason="writesDisabled ? OFFLINE_WRITE_HINT : null"
              @click="openRename(link)"
            >
              <FolderInput class="size-3.5" />
            </IconButton>
            <IconButton label="Change the link" @click="open(link)">
              <SlidersHorizontal class="size-3.5" />
            </IconButton>
          </div>
          <p v-if="link.last_run?.error" class="mt-1 break-all text-[11px] text-destructive">{{ link.last_run.error }}</p>
          <div v-if="link.last_run?.failed" class="mt-1 text-[11px] text-destructive">
            <p>{{ link.last_run.failed }} {{ link.last_run.failed === 1 ? 'file' : 'files' }} not added</p>
            <ul class="mt-0.5 space-y-0.5">
              <li v-for="failure in link.last_run.errors.slice(0, 5)" :key="failure.key" class="break-all">
                <span class="font-mono">{{ failure.key }}</span>: {{ failure.error }}
              </li>
            </ul>
          </div>
          <p v-if="rowError[link.import_id]" class="mt-1 break-all text-[11px] text-destructive">
            {{ rowError[link.import_id] }}
          </p>
        </li>
      </ul>
    </div>
  </template>
  <LinkedFolderDialog
    v-if="groupId"
    v-model:open="dialogOpen"
    :group-id="groupId"
    :backends="backends"
    :link="editing"
    :links="links"
    @saved="load"
  />
  <FileRulesDialog v-if="groupId" v-model:open="rulesOpen" :group-id="groupId" :link="picked" />
  <RenameFolderDialog v-model:open="renameOpen" :bucket="bucket" :from="picked?.key_prefix ?? ''" />
</template>
