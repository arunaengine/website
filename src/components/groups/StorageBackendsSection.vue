<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import StorageBackendDialog from '@/components/groups/StorageBackendDialog.vue'
import { computed, ref, watch } from 'vue'
import { Ban, CirclePlay, Database, Pencil, Plus } from '@lucide/vue'
import { isUnsupportedEndpoint, useAruna } from '@/composables/useAruna'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { backendSchema, backendSummary } from '@/lib/storage'
import { ApiError, type GroupBackendResponse } from '@/lib/api'

const props = defineProps<{ groupId: string; canAdmin: boolean }>()
const emit = defineEmits<{
  (e: 'count', count: number): void
  (e: 'backends', backends: GroupBackendResponse[]): void
}>()

const { listGroupBackends, disableGroupBackend, enableGroupBackend, saving } = useAruna()
const { writesDisabled } = useConnectivity()

const backends = ref<GroupBackendResponse[] | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
const hidden = ref(false)
const dialogOpen = ref(false)
const editing = ref<GroupBackendResponse | null>(null)
const confirmingId = ref<string | null>(null)
const actionError = ref<string | null>(null)
// Latched once the enable route answers 404: the node predates it.
const enableUnsupported = ref(false)

// Presence of the flag is the signal that this node disables the entry instead
// of deleting it outright.
const canDisable = computed(() =>
  (backends.value ?? []).some((backend) => typeof backend.disabled === 'boolean'),
)

let loadSeq = 0
async function load() {
  const seq = ++loadSeq
  loading.value = true
  loadError.value = null
  hidden.value = false
  try {
    const response = await listGroupBackends(props.groupId)
    if (seq !== loadSeq) return
    backends.value = response.backends
    emit('count', response.backends.length)
    emit('backends', response.backends)
  } catch (err) {
    if (seq !== loadSeq) return
    backends.value = null
    if (err instanceof ApiError && (err.status === 403 || err.status === 401)) hidden.value = true
    else loadError.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

watch(
  () => props.groupId,
  () => {
    backends.value = null
    confirmingId.value = null
    actionError.value = null
    void load()
  },
  { immediate: true },
)

function openCreate() {
  editing.value = null
  dialogOpen.value = true
}

function openEdit(backend: GroupBackendResponse) {
  editing.value = backend
  dialogOpen.value = true
}

async function disable(backend: GroupBackendResponse) {
  actionError.value = null
  try {
    await disableGroupBackend(props.groupId, backend.backend_id)
    confirmingId.value = null
    await load()
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err)
  }
}

async function enable(backend: GroupBackendResponse) {
  actionError.value = null
  try {
    await enableGroupBackend(props.groupId, backend.backend_id)
    await load()
  } catch (err) {
    if (isUnsupportedEndpoint(err)) enableUnsupported.value = true
    else actionError.value = err instanceof Error ? err.message : String(err)
  }
}

function kindLabel(backend: GroupBackendResponse): string {
  return backendSchema(backend.kind)?.label ?? backend.kind
}
</script>

<template>
  <div class="px-5 py-3">
    <div v-if="hidden" class="text-xs text-muted-foreground">
      Storage is only visible to group admins.
    </div>
    <Skeleton v-else-if="loading && !backends" class="h-16" />
    <ErrorPanel v-else-if="loadError" :message="loadError" @retry="load" />
    <EmptyState
      v-else-if="backends && !backends.length"
      title="No storage of your own"
      description="Add your own object storage to have this group's uploads written there instead of on this node."
    >
      <Button
        v-if="canAdmin"
        size="sm"
        :disabled="writesDisabled"
        :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
        @click="openCreate"
      >
        <Plus class="h-3.5 w-3.5" /> Add storage
      </Button>
    </EmptyState>
    <template v-else-if="backends">
      <ul class="space-y-1">
        <li
          v-for="backend in backends"
          :key="backend.backend_id"
          class="flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
        >
          <Database class="h-3.5 w-3.5 shrink-0 text-primary" />
          <span class="text-sm font-medium text-foreground">{{ backend.name }}</span>
          <Badge variant="secondary" class="text-[10px] uppercase">{{ kindLabel(backend) }}</Badge>
          <Badge
            v-if="backend.disabled"
            variant="warn"
            class="text-[10px] uppercase"
            title="New uploads no longer go here; files already stored stay readable"
          >
            disabled
          </Badge>
          <span class="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground" :title="backendSummary(backend)">
            {{ backendSummary(backend) }}
          </span>
          <template v-if="canAdmin">
            <template v-if="confirmingId === backend.backend_id">
              <span class="w-full text-xs text-foreground sm:w-auto">
                <template v-if="canDisable">
                  Stop using this storage? New uploads go elsewhere, files already stored stay
                  readable, and you can switch it back on at any time.
                </template>
                <template v-else>
                  Remove this storage? This node deletes the entry outright, and refuses while files
                  are still stored there.
                </template>
              </span>
              <Button variant="destructive" size="sm" :disabled="saving" @click="disable(backend)">
                {{ canDisable ? 'Disable' : 'Remove' }}
              </Button>
              <Button variant="ghost" size="sm" :disabled="saving" @click="confirmingId = null">Cancel</Button>
            </template>
            <template v-else>
              <Button
                v-if="backend.disabled && !enableUnsupported"
                variant="ghost"
                size="sm"
                class="h-6 px-2 text-xs text-muted-foreground"
                :aria-label="`Enable ${backend.name}`"
                :disabled="writesDisabled || saving"
                :title="writesDisabled ? OFFLINE_WRITE_HINT : 'Send new uploads here again'"
                @click="enable(backend)"
              >
                <CirclePlay class="h-3 w-3" /> Enable
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                class="text-muted-foreground"
                :aria-label="`Edit ${backend.name}`"
                :disabled="writesDisabled"
                :title="writesDisabled ? OFFLINE_WRITE_HINT : 'Change the name, settings or credentials'"
                @click="openEdit(backend)"
              >
                <Pencil class="h-3.5 w-3.5" />
              </Button>
              <Button
                v-if="!backend.disabled"
                variant="ghost"
                size="icon-sm"
                class="text-muted-foreground"
                :aria-label="`Disable ${backend.name}`"
                :disabled="writesDisabled"
                :title="writesDisabled ? OFFLINE_WRITE_HINT : 'Stop sending new uploads here'"
                @click="((confirmingId = backend.backend_id), (actionError = null))"
              >
                <Ban class="h-3.5 w-3.5" />
              </Button>
            </template>
          </template>
        </li>
      </ul>
      <p v-if="actionError" class="mt-2 text-xs text-destructive">{{ actionError }}</p>
      <p v-if="enableUnsupported" class="mt-2 text-[11px] text-muted-foreground">
        This node cannot switch a disabled storage back on yet.
      </p>
      <Button
        v-if="canAdmin"
        variant="outline"
        size="sm"
        class="mt-3"
        :disabled="writesDisabled"
        :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
        @click="openCreate"
      >
        <Plus class="h-3.5 w-3.5" /> Add storage
      </Button>
    </template>

    <StorageBackendDialog
      v-model:open="dialogOpen"
      :group-id="props.groupId"
      :backend="editing"
      @saved="load"
    />
  </div>
</template>
