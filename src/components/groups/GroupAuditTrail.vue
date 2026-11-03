<script setup lang="ts">
// The group's metadata audit trail, oldest first as the node merges it. `?audit_dataset=` narrows
// it to one dataset on the node, so the filter covers the whole trail, not only loaded rows.
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import ListShell from '@/components/ui/ListShell.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import Notice from '@/components/ui/Notice.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import { useAruna } from '@/composables/useAruna'
import { useUserDirectory } from '@/composables/useUserDirectory'
import type { AuditRecord } from '@/lib/api'
import { errorMessage, formatDateTime, truncateMiddle } from '@/lib/utils'
import { ChevronDown, Filter, ScrollText, X } from '@lucide/vue'

const props = defineProps<{ groupId: string }>()

const PAGE_SIZE = 50
const OPERATIONS: Record<string, string> = {
  create: 'Created the dataset',
  replace_rocrate: 'Saved the metadata',
  upsert_data_entity: 'Changed a file entry',
  upsert_contextual_entity: 'Changed an entity',
  delete: 'Deleted the dataset',
  set_visibility: 'Changed the visibility',
  place_replicas: 'Placed copies',
  withdraw_persistent_id: 'Withdrew the persistent id',
  checkpoint: 'Checkpoint',
}

const route = useRoute()
const router = useRouter()
const { listGroupAudit, sessionEpoch } = useAruna()
const { resolveUsers, cachedUser } = useUserDirectory()

const records = ref<AuditRecord[]>([])
const cursor = ref<string | null>(null)
const partial = ref(false)
const missingNodes = ref(0)
const loading = ref(false)
const loadingMore = ref(false)
const loadError = ref<string | null>(null)
const moreError = ref<string | null>(null)
let generation = 0

const dataset = computed(() => (typeof route.query.audit_dataset === 'string' ? route.query.audit_dataset : ''))
const state = computed<'loading' | 'error' | 'empty' | 'ready'>(() => {
  if (loading.value) return 'loading'
  if (loadError.value) return 'error'
  return records.value.length ? 'ready' : 'empty'
})
// Only a complete trail has a count; a partial page or a further page leaves it open.
const count = computed(() =>
  state.value === 'ready' && !cursor.value && !partial.value ? `${records.value.length} ${records.value.length === 1 ? 'record' : 'records'}` : undefined,
)

async function load(more = false) {
  const run = more ? generation : ++generation
  if (more) {
    loadingMore.value = true
    moreError.value = null
  } else {
    loading.value = true
    loadError.value = null
    moreError.value = null
    records.value = []
    cursor.value = null
    partial.value = false
    missingNodes.value = 0
  }
  try {
    const page = await listGroupAudit(props.groupId, {
      documentId: dataset.value || undefined,
      cursor: more ? (cursor.value ?? undefined) : undefined,
      limit: PAGE_SIZE,
    })
    if (run !== generation) return
    records.value = [...records.value, ...page.records]
    cursor.value = page.next_cursor ?? null
    partial.value = page.partial
    missingNodes.value = (page.missing_nodes?.length ?? 0) + page.missing_overflow
    void resolveUsers(page.records.map((record) => record.user_id))
  } catch (error) {
    if (run !== generation) return
    if (more) moreError.value = errorMessage(error)
    else loadError.value = errorMessage(error)
  } finally {
    if (run === generation) {
      loading.value = false
      loadingMore.value = false
    }
  }
}

watch([() => props.groupId, dataset, sessionEpoch], () => void load(), { immediate: true })

function filterDataset(id: string) {
  const query = { ...route.query }
  if (id) query.audit_dataset = id
  else delete query.audit_dataset
  void router.replace({ query })
}

function operationLabel(operation: string): string {
  return OPERATIONS[operation] ?? operation.replace(/_/g, ' ')
}

function userName(userId: string): string {
  return cachedUser(userId)?.name || truncateMiddle(userId)
}
</script>

<template>
  <section aria-labelledby="group-audit-heading">
    <SectionHeading
      id="group-audit-heading"
      title="Audit trail"
      :icon="ScrollText"
      :count="count"
      info="Every change to the datasets of this group, oldest first. Only group admins can read it."
    >
      <template #actions>
        <Button v-if="dataset" variant="outline" size="sm" @click="filterDataset('')"><X class="size-3.5" /> Show every dataset</Button>
        <RefreshButton :busy="loading" sr-label="Reload the audit trail" @click="load()" />
      </template>
    </SectionHeading>

    <Notice v-if="partial" tone="warning" class="mb-3">
      {{ missingNodes === 1 ? '1 node' : `${missingNodes} nodes` }} did not answer, so records may be missing. Reload to ask again.
    </Notice>
    <Notice v-if="dataset" tone="info" class="mb-3">
      Showing one dataset: <RouterLink :to="{ name: 'dataset', params: { id: dataset } }" class="font-mono hover:underline">{{ truncateMiddle(dataset) }}</RouterLink>
    </Notice>

    <ListShell
      :state="state"
      :error="loadError ?? undefined"
      :empty-title="dataset ? 'This dataset has no audit records.' : 'This group has no audit records yet.'"
      @retry="load()"
    >
      <ul class="divide-y divide-border">
        <li v-for="(record, index) in records" :key="`${record.node_id}-${record.occurred_at_ms}-${index}`" class="flex items-start gap-3 px-5 py-3">
          <div class="min-w-0 flex-1 space-y-0.5">
            <p class="text-sm">
              <span class="font-medium">{{ operationLabel(record.operation) }}</span>
              <span class="text-muted-foreground"> by </span>
              <RouterLink :to="{ name: 'user', params: { id: record.user_id } }" class="hover:underline">{{ userName(record.user_id) }}</RouterLink>
            </p>
            <p class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span class="tabular-nums">{{ formatDateTime(record.occurred_at_ms) }}</span>
              <RouterLink :to="{ name: 'dataset', params: { id: record.document_id } }" class="font-mono hover:underline">{{ truncateMiddle(record.document_id) }}</RouterLink>
              <NodeLabel :node-id="record.node_id" size="sm" />
            </p>
            <p v-if="record.details" class="truncate font-mono text-[11px] text-muted-foreground" :title="record.details">{{ record.details }}</p>
          </div>
          <IconButton v-if="!dataset" label="Show only this dataset" @click="filterDataset(record.document_id)"><Filter class="size-3.5" /></IconButton>
        </li>
      </ul>
      <template v-if="cursor || moreError" #footer>
        <div class="flex items-center justify-center gap-3 py-1">
          <span v-if="moreError" class="text-xs text-destructive">{{ moreError }}</span>
          <Button v-if="cursor" variant="outline" size="sm" :disabled="loadingMore" @click="load(true)">
            <ChevronDown class="size-3.5" /> {{ loadingMore ? 'Loading…' : 'Load more' }}
          </Button>
        </div>
      </template>
    </ListShell>
  </section>
</template>
