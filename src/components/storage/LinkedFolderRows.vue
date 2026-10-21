<script setup lang="ts">
// The linked folders of this bucket, in the row style of the sync list. Only
// group admins may read them; for everyone else the rows stay away.
import { computed, ref, watch } from 'vue'
import LinkedFolderDialog from '@/components/groups/LinkedFolderDialog.vue'
import LinkedFolderCard from '@/components/storage/LinkedFolderCard.vue'
import { useConnectivity } from '@/lib/connectivity'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import ListSkeleton from '@/components/ui/ListSkeleton.vue'
import { isUnsupportedEndpoint, useAruna } from '@/composables/useAruna'
import {
  ApiError,
  listBackendImports,
  runBackendImport,
  type BackendImport,
  type GroupBackendResponse,
} from '@/lib/api'
import { errorMessage } from '@/lib/utils'

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
    <ListSkeleton v-else-if="state === 'loading'" :rows="2" />
    <div v-else class="space-y-3">
      <LinkedFolderCard
        v-for="link in rows"
        :key="link.import_id"
        :group-id="groupId!"
        :link="link"
        :storage="storageName(link)"
        :running="runningId !== null"
        :run-error="rowError[link.import_id]"
        @run="run(link)"
        @edit="open(link)"
      />
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
</template>
