<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ConnectorDialog from '@/components/groups/ConnectorDialog.vue'
import { ref, watch } from 'vue'
import { KeyRound, Pencil, Plus, Trash2 } from '@lucide/vue'
import { useAruna } from '@/composables/useAruna'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { relativeTime } from '@/lib/utils'
import { ApiError, type SourceConnectorSummary } from '@/lib/api'

const props = defineProps<{ groupId: string; canWrite: boolean }>()
const emit = defineEmits<{ (e: 'count', count: number): void }>()

const { listGroupConnectors, deleteGroupConnector, saving } = useAruna()
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
    else loadError.value = err instanceof Error ? err.message : String(err)
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
    deleteError.value = err instanceof Error ? err.message : String(err)
  }
}

function endpointOf(connector: SourceConnectorSummary): string {
  const { endpoint, bucket } = connector.public_config
  if (connector.kind === 's3' && bucket) return `${endpoint ?? ''} · ${bucket}`
  return endpoint ?? ''
}
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
          :key="connector.connector_id"
          class="flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
        >
          <span class="text-sm font-medium text-foreground">{{ connector.name }}</span>
          <Badge variant="secondary" class="text-[10px] uppercase">{{ connector.kind }}</Badge>
          <Badge
            v-if="connector.has_secret_config"
            variant="outline"
            class="text-[10px] uppercase"
            title="Stored credentials; write-only, never displayed"
          >
            <KeyRound class="mr-0.5 h-3 w-3" /> credentials
          </Badge>
          <span class="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{{ endpointOf(connector) }}</span>
          <span class="shrink-0 text-[11px] text-muted-foreground">{{ relativeTime(connector.updated_at) }}</span>
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
  </div>
</template>
