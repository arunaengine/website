<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import ConnectorDialog from '@/components/groups/ConnectorDialog.vue'
import ConnectorEntriesBrowser from '@/components/data/ConnectorEntriesBrowser.vue'
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { FolderSearch, KeyRound, Pencil, PlugZap, Plus, Trash2 } from '@lucide/vue'
import { isUnsupportedEndpoint, useAruna } from '@/composables/useAruna'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { errorMessage, relativeTime } from '@/lib/utils'
import { ApiError, type ConnectorCheckResponse, type SourceConnectorSummary } from '@/lib/api'
import Spinner from '@/components/ui/Spinner.vue'

const props = defineProps<{ groupId: string; canWrite: boolean }>()
const emit = defineEmits<{ (e: 'count', count: number): void }>()

const { listGroupConnectors, deleteGroupConnector, checkGroupConnector, saving } = useAruna()
const { writesDisabled } = useConnectivity()

const connectors = ref<SourceConnectorSummary[] | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
const hidden = ref(false)
const dialogOpen = ref(false)
const editing = ref<SourceConnectorSummary | null>(null)
const confirmingId = ref<string | null>(null)
const deleteError = ref<string | null>(null)

// Only the latest load writes state when the group switches mid-flight.
let loadSeq = 0
async function load() {
  const seq = ++loadSeq
  loading.value = true
  loadError.value = null
  hidden.value = false
  try {
    const response = await listGroupConnectors(props.groupId)
    if (seq !== loadSeq) return
    connectors.value = response.connectors
    emit('count', response.connectors.length)
  } catch (err) {
    if (seq !== loadSeq) return
    connectors.value = null
    if (err instanceof ApiError && err.status === 403) hidden.value = true
    else loadError.value = errorMessage(err)
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

watch(
  () => props.groupId,
  () => {
    connectors.value = null
    confirmingId.value = null
    deleteError.value = null
    void load()
  },
  { immediate: true },
)

function openCreate() {
  editing.value = null
  dialogOpen.value = true
}

function openEdit(connector: SourceConnectorSummary) {
  editing.value = connector
  dialogOpen.value = true
}

async function confirmDelete(connector: SourceConnectorSummary) {
  deleteError.value = null
  try {
    await deleteGroupConnector(props.groupId, connector.connector_id)
    confirmingId.value = null
    await load()
  } catch (err) {
    deleteError.value = errorMessage(err)
  }
}

function endpointOf(connector: SourceConnectorSummary): string {
  const { endpoint, bucket } = connector.public_config
  if (connector.kind === 's3' && bucket) return `${endpoint ?? ''} · ${bucket}`
  return endpoint ?? ''
}

// Stored-config connection test (agreed contract:
// POST /groups/{gid}/connectors/{cid}/check). Once one call answers 404/501 the
// affordance hides; the node predates the endpoint.
const checkUnsupported = ref(false)
const checkingId = ref<string | null>(null)
const checkResults = ref<Record<string, ConnectorCheckResponse | { ok: false; error: string }>>({})

async function testConnector(connector: SourceConnectorSummary) {
  if (checkingId.value) return
  checkingId.value = connector.connector_id
  const results = { ...checkResults.value }
  delete results[connector.connector_id]
  checkResults.value = results
  try {
    checkResults.value = {
      ...checkResults.value,
      [connector.connector_id]: await checkGroupConnector(props.groupId, connector.connector_id),
    }
  } catch (err) {
    if (isUnsupportedEndpoint(err)) {
      checkUnsupported.value = true
    } else {
      checkResults.value = {
        ...checkResults.value,
        [connector.connector_id]: { ok: false, error: errorMessage(err) },
      }
    }
  } finally {
    checkingId.value = null
  }
}

// Entries browser dialog (read-only; reuses the Add data browser component).
const browseTarget = ref<SourceConnectorSummary | null>(null)
const browseUnsupported = ref(false)

// Deep link /app/groups/:id?connector=<connector_id> (e.g. from the Data
// manager's provenance links): scroll the named connector into view and flash
// a short-lived highlight ring once it is listed.
const route = useRoute()
const highlightedId = ref<string | null>(null)
let highlightTimer: number | undefined

function focusConnectorFromQuery() {
  const target = typeof route.query.connector === 'string' ? route.query.connector : ''
  if (!target || highlightedId.value === target) return
  if (!connectors.value?.some((connector) => connector.connector_id === target)) return
  highlightedId.value = target
  void nextTick(() => {
    document
      .getElementById(`connector-${target}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
  if (highlightTimer !== undefined) window.clearTimeout(highlightTimer)
  highlightTimer = window.setTimeout(() => (highlightedId.value = null), 2_500)
}

watch([() => route.query.connector, connectors], () => focusConnectorFromQuery(), {
  immediate: true,
})
onBeforeUnmount(() => {
  if (highlightTimer !== undefined) window.clearTimeout(highlightTimer)
})
</script>

<template>
  <div class="px-5 py-3">
    <div v-if="hidden" class="text-xs text-muted-foreground">
      Source connectors are only visible with read access to the group's data.
    </div>
    <Skeleton v-else-if="loading && !connectors" class="h-16" />
    <ErrorPanel v-else-if="loadError" :message="loadError" @retry="load" />
    <EmptyState
      v-else-if="connectors && !connectors.length"
      title="No source connectors"
      description="Connectors let this group ingest data from external sources like HTTP, S3, WebDAV, or FTP."
    >
      <Button
        v-if="canWrite"
        size="sm"
        :disabled="writesDisabled"
        :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
        @click="openCreate"
      >
        <Plus class="h-3.5 w-3.5" /> Register connector
      </Button>
    </EmptyState>
    <template v-else-if="connectors">
      <ul class="space-y-1">
        <li
          v-for="connector in connectors"
          :id="`connector-${connector.connector_id}`"
          :key="connector.connector_id"
          class="flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5 transition-shadow hover:bg-muted/50"
          :class="highlightedId === connector.connector_id ? 'bg-primary/5 ring-2 ring-primary/50' : ''"
        >
          <span class="text-sm font-medium text-foreground">{{ connector.name }}</span>
          <Badge size="sm" variant="secondary" class="uppercase">{{ connector.kind }}</Badge>
          <Badge size="sm"
            v-if="connector.has_secret_config"
            variant="outline"
            class="uppercase"
            title="Stored credentials; write-only, never displayed"
          >
            <KeyRound class="mr-0.5 h-3 w-3" /> credentials
          </Badge>
          <span class="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{{ endpointOf(connector) }}</span>
          <span class="shrink-0 text-[11px] text-muted-foreground">{{ relativeTime(connector.updated_at) }}</span>
          <template v-if="checkResults[connector.connector_id]">
            <Badge size="sm"
              v-if="checkResults[connector.connector_id].ok"
              variant="success"
              class="uppercase"
              :title="'latency_ms' in checkResults[connector.connector_id] && (checkResults[connector.connector_id] as ConnectorCheckResponse).latency_ms !== undefined ? `${(checkResults[connector.connector_id] as ConnectorCheckResponse).latency_ms} ms` : undefined"
            >
              ok{{ (checkResults[connector.connector_id] as ConnectorCheckResponse).latency_ms !== undefined ? ` · ${(checkResults[connector.connector_id] as ConnectorCheckResponse).latency_ms} ms` : '' }}
            </Badge>
            <Badge v-else size="sm" variant="destructive" class="max-w-[16rem] truncate" :title="checkResults[connector.connector_id].error">
              {{ checkResults[connector.connector_id].error || 'failed' }}
            </Badge>
          </template>
          <Button
            v-if="!checkUnsupported && connector.kind !== 'aruna_native'"
            variant="ghost"
            size="sm"
            class="h-6 px-2 text-xs text-muted-foreground"
            :aria-label="`Test connector ${connector.name}`"
            :disabled="checkingId !== null"
            @click="testConnector(connector)"
          >
            <Spinner v-if="checkingId === connector.connector_id" />
            <PlugZap v-else class="h-3 w-3" />
            Test
          </Button>
          <Button
            v-if="!browseUnsupported && connector.kind !== 'aruna_native'"
            variant="ghost"
            size="sm"
            class="h-6 px-2 text-xs text-muted-foreground"
            :aria-label="`Browse connector ${connector.name}`"
            @click="browseTarget = connector"
          >
            <FolderSearch class="h-3 w-3" /> Browse
          </Button>
          <template v-if="canWrite">
            <template v-if="confirmingId === connector.connector_id">
              <span class="text-xs text-foreground">Delete this connector?</span>
              <Button variant="destructive" size="sm" :disabled="saving" @click="confirmDelete(connector)">Delete</Button>
              <Button variant="ghost" size="sm" :disabled="saving" @click="confirmingId = null">Cancel</Button>
            </template>
            <template v-else>
              <Button
                variant="ghost"
                size="icon-sm"
                class="text-muted-foreground"
                :aria-label="`Edit connector ${connector.name}`"
                :disabled="writesDisabled"
                :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
                @click="openEdit(connector)"
              >
                <Pencil class="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                class="text-muted-foreground"
                :aria-label="`Delete connector ${connector.name}`"
                :disabled="writesDisabled"
                :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
                @click="((confirmingId = connector.connector_id), (deleteError = null))"
              >
                <Trash2 class="h-3.5 w-3.5" />
              </Button>
            </template>
          </template>
        </li>
      </ul>
      <p v-if="deleteError" class="mt-2 text-xs text-destructive">{{ deleteError }}</p>
      <Button
        v-if="canWrite"
        variant="outline"
        size="sm"
        class="mt-3"
        :disabled="writesDisabled"
        :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
        @click="openCreate"
      >
        <Plus class="h-3.5 w-3.5" /> Register connector
      </Button>
    </template>

    <ConnectorDialog
      v-model:open="dialogOpen"
      :group-id="props.groupId"
      :connector="editing"
      @saved="load"
    />

    <Dialog :open="browseTarget !== null" @update:open="(v: boolean) => { if (!v) browseTarget = null }">
      <DialogContent class="max-w-xl">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2">
            <FolderSearch class="h-4 w-4 text-primary" /> Browse {{ browseTarget?.name }}
          </DialogTitle>
          <DialogDescription>
            Lists what the node sees through this connector; ingest entries from a bucket's Add data dialog.
          </DialogDescription>
        </DialogHeader>
        <ConnectorEntriesBrowser
          v-if="browseTarget"
          :group-id="props.groupId"
          :connector-id="browseTarget.connector_id"
          @unsupported="browseUnsupported = true"
        />
      </DialogContent>
    </Dialog>
  </div>
</template>
