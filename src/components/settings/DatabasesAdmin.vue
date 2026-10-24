<script setup lang="ts">
// Realm admins and database curators mark buckets as databases, see what is waiting for the
// groups that own the buckets, and remove marks. A mark grants nothing: who may read a database
// is decided by the bucket and by the dataset.
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import BucketSearchBox from '@/components/data/BucketSearchBox.vue'
import DatabaseMarkForm from '@/components/data/DatabaseMarkForm.vue'
import DatabaseRequestItem from '@/components/data/DatabaseRequestItem.vue'
import MockCurators from '@/components/settings/MockCurators.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import Notice from '@/components/ui/Notice.vue'
import { useAruna } from '@/composables/useAruna'
import { useDatabaseRequests } from '@/composables/useDatabaseRequests'
import { useDatabases } from '@/composables/useDatabases'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { ApiError, apiErrorMessage, type BucketSearchHit } from '@/lib/api'
import { rowOf, STATE_NOTES, type DatabaseRow } from '@/lib/databases'
import { mockEnabled } from '@/lib/distributedMock'
import { Trash2 } from '@lucide/vue'

const { realmInfo, listDatabases, removeDatabase, getBucketDistribution, sessionEpoch } = useAruna()
const { isLocalNode, localNodeId } = useRealmNodes()
const databases = useDatabases()
const requests = useDatabaseRequests()

const path = computed(() => (realmInfo.value ? `/${realmInfo.value.realm_id}/admin/databases` : ''))

// The curator view lists inactive entries too. A user without the right gets 403.
const listed = ref<DatabaseRow[]>([])
const next = ref<string | null>(null)
const state = ref<'loading' | 'ready' | 'refused' | 'failed'>('loading')
const failure = ref<string | null>(null)
let runs = 0

async function load(more = false) {
  const run = ++runs
  const epoch = sessionEpoch.value
  if (!more) state.value = 'loading'
  try {
    const page = await listDatabases({ curation: true, limit: 50, ...(more && next.value ? { after: next.value } : {}) })
    if (run !== runs || epoch !== sessionEpoch.value) return
    listed.value = more ? [...listed.value, ...page.databases.map(rowOf)] : page.databases.map(rowOf)
    next.value = page.next_after ?? null
    state.value = 'ready'
  } catch (cause) {
    if (run !== runs || epoch !== sessionEpoch.value) return
    state.value = cause instanceof ApiError && cause.status === 403 ? 'refused' : 'failed'
    failure.value = apiErrorMessage(cause)
  }
}

onMounted(() => {
  void load()
  requests.reload()
})

async function remove(row: DatabaseRow) {
  failure.value = null
  try {
    await removeDatabase(row.entryId)
  } catch (cause) {
    failure.value = apiErrorMessage(cause)
  }
  await Promise.all([load(), databases.reload()])
}

const label = (row: DatabaseRow) => row.title || 'A dataset you cannot read'
const where = (row: DatabaseRow) => row.bucket || 'A bucket you cannot read'

// The bucket to mark: one of this node, with the set it belongs to.
const chosen = ref<BucketSearchHit | null>(null)
const setId = ref<string | null | undefined>(undefined)
let lookups = 0

watch(chosen, async (hit) => {
  const lookup = ++lookups
  setId.value = undefined
  if (!hit || !isLocalNode(hit.node_id)) return
  try {
    const status = await getBucketDistribution(hit.bucket)
    if (lookup === lookups) setId.value = status.set_id
  } catch (cause) {
    if (lookup === lookups && cause instanceof ApiError && cause.status === 404) setId.value = null
  }
})

const nodeId = computed(() => (chosen.value && !isLocalNode(chosen.value.node_id) ? chosen.value.node_id : null))
const search = ref('')
</script>

<template>
  <div class="space-y-6">
    <section class="space-y-3">
      <div>
        <h2 class="font-display text-base font-semibold text-aruna-navy">Who can create databases</h2>
        <p class="text-xs text-muted-foreground">
          Realm admins always can. Others need the access rule below with WRITE in one of their realm roles.
          The group that owns a bucket must agree.
        </p>
      </div>
      <p v-if="path" class="break-all font-mono text-[11px] text-muted-foreground">
        {{ path }} <span class="uppercase">write</span>
        <CopyButton :value="path" label="Copy the access rule" class="ml-1 align-middle" />
      </p>
      <MockCurators v-if="mockEnabled()" />
    </section>

    <section class="space-y-3">
      <div>
        <h2 class="font-display text-base font-semibold text-aruna-navy">Waiting for the owning group</h2>
        <p class="text-xs text-muted-foreground">Marks that the group admins of the bucket have not agreed to yet.</p>
      </div>
      <ul class="divide-y divide-border rounded-md border border-border">
        <li v-for="request in requests.requests.value" :key="request.request_id" class="px-4 py-3">
          <DatabaseRequestItem :request="request" />
        </li>
        <li v-if="!requests.requests.value.length" class="px-4 py-4 text-center text-sm text-muted-foreground">
          {{ requests.loading.value ? 'Loading…' : 'Nothing is waiting.' }}
        </li>
      </ul>
      <Notice v-if="requests.failure.value" tone="error">{{ requests.failure.value }}</Notice>
    </section>

    <section class="space-y-3">
      <div>
        <h2 class="font-display text-base font-semibold text-aruna-navy">Databases</h2>
        <p class="text-xs text-muted-foreground">The mark grants nothing. Descriptions come from the dataset.</p>
      </div>
      <Notice v-if="state === 'refused'" tone="info">This account cannot curate databases.</Notice>
      <Notice v-else-if="state === 'failed'" tone="error">{{ failure }}</Notice>
      <ul v-else class="divide-y divide-border rounded-md border border-border">
        <li v-for="row in listed" :key="row.entryId" class="flex flex-wrap items-center gap-3 px-4 py-3">
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-foreground">
              {{ label(row) }} <span class="font-mono text-xs font-normal text-muted-foreground">{{ where(row) }}</span>
              <Badge v-if="row.state !== 'active'" variant="warn" size="sm" class="ml-1">{{ STATE_NOTES[row.state] }}</Badge>
            </p>
            <p class="text-xs text-muted-foreground">Dataset <span class="font-mono">{{ row.datasetId }}</span></p>
          </div>
          <Button v-if="row.title" size="sm" variant="outline" as-child>
            <RouterLink :to="{ name: 'dataset', params: { id: row.datasetId } }">Open the dataset</RouterLink>
          </Button>
          <Button size="sm" variant="ghost" class="text-destructive hover:text-destructive" :aria-label="`Remove ${label(row)}`" @click="remove(row)">
            <Trash2 class="size-3.5" /> Remove
          </Button>
        </li>
        <li v-if="state === 'loading'" class="px-4 py-6 text-center text-sm text-muted-foreground">Loading…</li>
        <li v-else-if="!listed.length" class="px-4 py-6 text-center text-sm text-muted-foreground">No bucket is marked as a database yet.</li>
      </ul>
      <Button v-if="next" size="sm" variant="ghost" @click="load(true)">More databases</Button>
      <Notice v-if="failure && state === 'ready'" tone="error">{{ failure }}</Notice>
    </section>

    <section v-if="state !== 'refused'" class="space-y-3 rounded-md border border-border p-4">
      <h3 class="text-sm font-medium text-foreground">Mark a bucket as a database</h3>
      <BucketSearchBox
        v-model="search"
        mode="picker"
        placeholder="Find a bucket…"
        @select="(hit: BucketSearchHit) => (chosen = hit)"
      />
      <DatabaseMarkForm
        v-if="chosen && (nodeId || setId !== undefined)"
        :key="`${chosen.node_id}/${chosen.bucket}`"
        :bucket="chosen.bucket"
        :node-id="nodeId"
        :set-id="setId ?? null"
        @done="load()"
      />
      <p v-else-if="chosen && localNodeId" class="text-xs text-muted-foreground">Reading the bucket…</p>
    </section>
  </div>
</template>
