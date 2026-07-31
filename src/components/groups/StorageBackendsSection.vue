<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import StorageBackendDialog from '@/components/groups/StorageBackendDialog.vue'
import RotateSecretDialog from '@/components/groups/RotateSecretDialog.vue'
import { computed, ref, watch } from 'vue'
import { Archive, Database, KeyRound, Pencil, Plus, Undo2 } from '@lucide/vue'
import { isUnsupportedEndpoint, useAruna } from '@/composables/useAruna'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { backendSchema, backendSummary } from '@/lib/storage'
import { ApiError, type GroupBackendResponse } from '@/lib/api'

const props = defineProps<{ groupId: string; canAdmin: boolean }>()
const emit = defineEmits<{
  (e: 'count', count: number): void
  (e: 'backends', backends: GroupBackendResponse[]): void
}>()

const { listGroupBackends, retireGroupBackend, reinstateGroupBackend, saving } = useAruna()
const { writesDisabled } = useConnectivity()

const backends = ref<GroupBackendResponse[] | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
const hidden = ref(false)
const dialogOpen = ref(false)
const editing = ref<GroupBackendResponse | null>(null)
const rotating = ref<GroupBackendResponse | null>(null)
const confirmingId = ref<string | null>(null)
const actionError = ref<string | null>(null)
// Latched once a Phase A route answers 404: the node predates it.
const reinstateUnsupported = ref(false)
const rotateUnsupported = ref(false)

// Presence of the flag is the signal that this node retires logically instead
// of deleting the registration outright.
const retireIsLogical = computed(() =>
  (backends.value ?? []).some((backend) => typeof backend.retiring === 'boolean'),
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

async function retire(backend: GroupBackendResponse) {
  actionError.value = null
  try {
    await retireGroupBackend(props.groupId, backend.backend_id)
    confirmingId.value = null
    await load()
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err)
  }
}

async function reinstate(backend: GroupBackendResponse) {
  actionError.value = null
  try {
    await reinstateGroupBackend(props.groupId, backend.backend_id)
    await load()
  } catch (err) {
    if (isUnsupportedEndpoint(err)) reinstateUnsupported.value = true
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
      Storage backends are only visible to group admins.
    </div>
    <Skeleton v-else-if="loading && !backends" class="h-16" />
    <ErrorPanel v-else-if="loadError" :message="loadError" @retry="load" />
    <EmptyState
      v-else-if="backends && !backends.length"
      title="No storage backends"
      description="Register your own object store to have this group's uploads written there instead of the node's storage."
    >
      <Button
        v-if="canAdmin"
        size="sm"
        :disabled="writesDisabled"
        :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
        @click="openCreate"
      >
        <Plus class="h-3.5 w-3.5" /> Register backend
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
            v-if="backend.retiring"
            variant="warn"
            class="text-[10px] uppercase"
            title="Writes are refused; stored objects stay readable"
          >
            <Archive class="mr-0.5 h-3 w-3" /> retiring
          </Badge>
          <span class="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground" :title="backendSummary(backend)">
            {{ backendSummary(backend) }}
          </span>
          <template v-if="canAdmin">
            <template v-if="confirmingId === backend.backend_id">
              <span class="w-full text-xs text-foreground sm:w-auto">
                <template v-if="retireIsLogical">
                  Retire this backend? Writes stop routing to it, stored objects stay readable, and
                  the registration is removed automatically once the last copy is gone.
                </template>
                <template v-else>
                  Remove this registration? This node deletes it outright and refuses while objects
                  still live on the backend.
                </template>
              </span>
              <Button variant="destructive" size="sm" :disabled="saving" @click="retire(backend)">
                {{ retireIsLogical ? 'Retire' : 'Remove' }}
              </Button>
              <Button variant="ghost" size="sm" :disabled="saving" @click="confirmingId = null">Cancel</Button>
            </template>
            <template v-else>
              <Button
                v-if="!rotateUnsupported"
                variant="ghost"
                size="sm"
                class="h-6 px-2 text-xs text-muted-foreground"
                :aria-label="`Rotate credentials of ${backend.name}`"
                :disabled="writesDisabled"
                :title="writesDisabled ? OFFLINE_WRITE_HINT : 'Replace the stored credentials'"
                @click="rotating = backend"
              >
                <KeyRound class="h-3 w-3" /> Rotate
              </Button>
              <Button
                v-if="backend.retiring && !reinstateUnsupported"
                variant="ghost"
                size="sm"
                class="h-6 px-2 text-xs text-muted-foreground"
                :aria-label="`Reinstate ${backend.name}`"
                :disabled="writesDisabled || saving"
                :title="writesDisabled ? OFFLINE_WRITE_HINT : 'Accept writes on this backend again'"
                @click="reinstate(backend)"
              >
                <Undo2 class="h-3 w-3" /> Reinstate
              </Button>
              <Button
                v-if="!backend.retiring"
                variant="ghost"
                size="icon-sm"
                class="text-muted-foreground"
                :aria-label="`Edit ${backend.name}`"
                :disabled="writesDisabled"
                :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
                @click="openEdit(backend)"
              >
                <Pencil class="h-3.5 w-3.5" />
              </Button>
              <Button
                v-if="!backend.retiring"
                variant="ghost"
                size="icon-sm"
                class="text-muted-foreground"
                :aria-label="`Retire ${backend.name}`"
                :disabled="writesDisabled"
                :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
                @click="((confirmingId = backend.backend_id), (actionError = null))"
              >
                <Archive class="h-3.5 w-3.5" />
              </Button>
            </template>
          </template>
        </li>
      </ul>
      <p v-if="actionError" class="mt-2 text-xs text-destructive">{{ actionError }}</p>
      <p v-if="reinstateUnsupported" class="mt-2 text-[11px] text-muted-foreground">
        This node cannot reinstate a retired backend yet.
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
        <Plus class="h-3.5 w-3.5" /> Register backend
      </Button>
    </template>

    <StorageBackendDialog
      v-model:open="dialogOpen"
      :group-id="props.groupId"
      :backend="editing"
      @saved="load"
    />

    <RotateSecretDialog
      :open="rotating !== null"
      :group-id="props.groupId"
      :backend="rotating"
      @update:open="(v: boolean) => { if (!v) rotating = null }"
      @rotated="load"
      @unsupported="rotateUnsupported = true"
    />
  </div>
</template>
