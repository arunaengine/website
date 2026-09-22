<script setup lang="ts">
// Repository connectors of one group: Invenio or Zenodo and OAI-PMH endpoints.
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import RepositoryDialog from '@/components/groups/RepositoryDialog.vue'
import { ref, watch } from 'vue'
import { KeyRound, Library, Pencil, Plus, Trash2 } from '@lucide/vue'
import { isUnsupportedEndpoint, useAruna } from '@/composables/useAruna'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { errorMessage, relativeTime } from '@/lib/utils'
import { ApiError, deleteRepositoryConnector, listRepositoryConnectors, type RepositoryConnector } from '@/lib/api'

const props = defineProps<{ groupId: string; canWrite: boolean }>()

const { apiBaseUrl, authToken, sessionEpoch } = useAruna()
const { writesDisabled } = useConnectivity()

function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

const connectors = ref<RepositoryConnector[] | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
const hidden = ref(false)
const unsupported = ref(false)
const dialogOpen = ref(false)
const editing = ref<RepositoryConnector | null>(null)
const confirmingId = ref<string | null>(null)
const deleting = ref(false)
const deleteError = ref<string | null>(null)

// Only the latest load for the current group and session writes state.
let loadSeq = 0
async function load() {
  const seq = ++loadSeq
  const epoch = sessionEpoch.value
  const current = () => seq === loadSeq && epoch === sessionEpoch.value
  loading.value = true
  loadError.value = null
  try {
    const list = await listRepositoryConnectors(props.groupId, client())
    if (current()) connectors.value = list
  } catch (err) {
    if (!current()) return
    connectors.value = null
    if (err instanceof ApiError && err.status === 403) hidden.value = true
    else if (isUnsupportedEndpoint(err)) unsupported.value = true
    else loadError.value = errorMessage(err)
  } finally {
    if (current()) loading.value = false
  }
}

watch(
  [() => props.groupId, sessionEpoch],
  () => {
    connectors.value = null
    hidden.value = false
    unsupported.value = false
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

function openEdit(connector: RepositoryConnector) {
  editing.value = connector
  dialogOpen.value = true
}

async function confirmDelete(connector: RepositoryConnector) {
  deleteError.value = null
  deleting.value = true
  try {
    await deleteRepositoryConnector(props.groupId, connector.connector_id, client())
    confirmingId.value = null
    await load()
  } catch (err) {
    deleteError.value = errorMessage(err)
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div v-if="!unsupported" class="border-t border-border px-5 py-3">
    <h3 class="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
      <Library class="h-4 w-4 text-primary" /> Repositories
    </h3>
    <p v-if="hidden" class="text-xs text-muted-foreground">
      Repositories are only visible with read access to the group's data.
    </p>
    <Skeleton v-else-if="loading && !connectors" class="h-12" />
    <ErrorPanel v-else-if="loadError" :message="loadError" @retry="load" />
    <EmptyState
      v-else-if="connectors && !connectors.length"
      compact
      title="No repositories."
      description="Add Invenio, Zenodo or OAI-PMH to import published records and publish datasets."
    >
      <Button
        v-if="canWrite"
        size="sm"
        :disabled="writesDisabled"
        :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
        @click="openCreate"
      >
        <Plus class="h-3.5 w-3.5" /> Add repository
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
          <Badge size="sm" variant="secondary">{{ connector.kind === 'invenio' ? 'Invenio' : 'OAI-PMH' }}</Badge>
          <Badge
            v-if="connector.has_secret_config"
            size="sm"
            variant="outline"
            title="A stored read token; write-only, never displayed"
          >
            <KeyRound class="mr-0.5 h-3 w-3" /> read token
          </Badge>
          <span class="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
            {{ connector.endpoint }}<template v-if="connector.community"> · {{ connector.community }}</template>
          </span>
          <span class="shrink-0 text-[11px] text-muted-foreground">{{ relativeTime(connector.updated_at) }}</span>
          <template v-if="canWrite">
            <template v-if="confirmingId === connector.connector_id">
              <span class="text-xs text-foreground">Delete this repository? Existing links stop working.</span>
              <Button variant="destructive" size="sm" :disabled="deleting" @click="confirmDelete(connector)">Delete</Button>
              <Button variant="ghost" size="sm" :disabled="deleting" @click="confirmingId = null">Cancel</Button>
            </template>
            <template v-else>
              <Button
                variant="ghost"
                size="icon-sm"
                class="text-muted-foreground"
                :aria-label="`Edit repository ${connector.name}`"
                :disabled="writesDisabled"
                @click="openEdit(connector)"
              >
                <Pencil class="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                class="text-muted-foreground"
                :aria-label="`Delete repository ${connector.name}`"
                :disabled="writesDisabled"
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
        <Plus class="h-3.5 w-3.5" /> Add repository
      </Button>
    </template>

    <RepositoryDialog v-model:open="dialogOpen" :group-id="props.groupId" :connector="editing" @saved="load" />
  </div>
</template>
