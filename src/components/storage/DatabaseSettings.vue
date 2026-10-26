<script setup lang="ts">
// Whether this bucket is a database: the dataset that describes it, the mark, and the agreement
// of the group that owns the bucket. Marking needs the databases right; removing needs it too,
// or admin rights on the owning group.
import { computed, onMounted, ref, watch } from 'vue'
import DatabaseHeader from '@/components/data/DatabaseHeader.vue'
import DatabaseMarkForm from '@/components/data/DatabaseMarkForm.vue'
import DatabaseRequestItem from '@/components/data/DatabaseRequestItem.vue'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import { useAruna } from '@/composables/useAruna'
import { useDatabaseRequests } from '@/composables/useDatabaseRequests'
import { useDatabases } from '@/composables/useDatabases'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { ApiError, apiErrorMessage } from '@/lib/api'
import { databaseOf, requestOf, rowOf, STATE_NOTES, targetOf, type DatabaseRow } from '@/lib/databases'
import { Database } from '@lucide/vue'

const props = defineProps<{
  bucket: string
  nodeId: string | null
  /** The set of the bucket; null for an ordinary bucket, undefined while it is not known. */
  setId?: string | null
  groupName?: string | null
  canAdmin: boolean
}>()

const { listDatabases, removeDatabase, sessionEpoch } = useAruna()
const { localNodeId } = useRealmNodes()
const databases = useDatabases()
const requests = useDatabaseRequests()

// The curator view answers 403 to a user without the databases right. It also lists marks that
// the reader list leaves out, so a curator learns of every mark of the realm (at most 1024).
const curate = ref<'unknown' | 'yes' | 'no'>('unknown')
const curated = ref<DatabaseRow[] | null>(null)
const asking = ref(false)
const failure = ref<string | null>(null)
let curateRuns = 0

async function readCurated() {
  const run = ++curateRuns
  const epoch = sessionEpoch.value
  const found: DatabaseRow[] = []
  let after: string | undefined
  curated.value = null
  try {
    for (let page = 0; page < 11; page++) {
      const answer = await listDatabases({ curation: true, limit: 100, ...(after ? { after } : {}) })
      if (run !== curateRuns || epoch !== sessionEpoch.value) return
      found.push(...answer.databases.map(rowOf))
      after = answer.next_after ?? undefined
      if (!after) break
    }
    curate.value = 'yes'
    curated.value = after ? null : found
  } catch (cause) {
    if (run !== curateRuns || epoch !== sessionEpoch.value) return
    curate.value = cause instanceof ApiError && cause.status === 403 ? 'no' : 'unknown'
  }
}

onMounted(() => {
  databases.ensure()
  requests.ensure()
  void readCurated()
})
watch(() => sessionEpoch.value, () => void readCurated())

const known = computed(() => props.setId !== undefined || Boolean(props.nodeId))
const target = computed(() => {
  const node = props.nodeId ?? localNodeId.value
  return known.value && node ? targetOf(props.bucket, node, props.setId ?? null) : null
})
const listed = computed(() => databases.find(props.bucket, props.nodeId, props.setId))
const entry = computed(() => listed.value ?? (target.value && curated.value ? databaseOf(curated.value, target.value) : undefined))
const pending = computed(() => (target.value ? requestOf(requests.requests.value, target.value) : undefined))
// "Not a database" needs a complete answer; until then the page says it does not know.
const lookup = computed<'unknown' | 'failed' | 'ready'>(() => {
  if (databases.state.value === 'failed') return 'failed'
  if (!target.value || databases.state.value !== 'ready' || !databases.complete.value) return 'unknown'
  return curate.value === 'yes' && !curated.value ? 'unknown' : 'ready'
})

async function remove() {
  if (!entry.value) return
  failure.value = null
  try {
    await removeDatabase(entry.value.entryId)
  } catch (cause) {
    failure.value = apiErrorMessage(cause)
  }
  await Promise.all([databases.reload(), readCurated()])
}

function marked() {
  asking.value = false
  void readCurated()
}
</script>

<template>
  <section class="surface">
    <header class="flex items-center gap-2 border-b border-border px-5 py-4">
      <Database class="size-4 text-primary" />
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Database</h2>
    </header>
    <div class="space-y-3 px-5 py-4 text-sm">
      <template v-if="entry">
        <DatabaseHeader v-if="listed" bare :bucket="bucket" :node-id="nodeId" :set-id="setId" />
        <p v-else class="text-muted-foreground">Marked as a database.</p>
        <Notice v-if="entry.state !== 'active'" tone="warning">{{ STATE_NOTES[entry.state] }}</Notice>
        <Button v-if="curate === 'yes' || canAdmin" size="sm" variant="outline" @click="remove">Remove the database mark</Button>
      </template>
      <template v-else-if="pending">
        <Notice tone="warning" :title="`Waiting for the group admins${groupName ? ` of ${groupName}` : ''}`">
          The mark takes effect when they agree.
        </Notice>
        <DatabaseRequestItem :request="pending" />
        <Notice v-if="requests.failure.value" tone="error">{{ requests.failure.value }}</Notice>
      </template>
      <Notice v-else-if="lookup === 'failed'" tone="error">The databases could not be read: {{ databases.error.value }}</Notice>
      <p v-else-if="lookup === 'unknown'" class="text-muted-foreground">Not known yet whether this bucket is a database.</p>
      <template v-else>
        <p class="text-muted-foreground">{{ curate === 'yes' ? 'Not a database.' : 'Not listed as a database.' }}</p>
        <p v-if="curate === 'no'" class="text-xs text-muted-foreground">
          Realm admins and database curators can mark a bucket. The group that owns it must agree.
        </p>
        <template v-else-if="curate === 'yes' && known">
          <Button v-if="!asking" size="sm" variant="outline" @click="asking = true">Mark as database</Button>
          <DatabaseMarkForm
            v-else
            :bucket="bucket"
            :node-id="nodeId"
            :set-id="setId ?? null"
            :group-name="groupName"
            @done="marked"
          />
        </template>
      </template>
      <Notice v-if="failure" tone="error">{{ failure }}</Notice>
    </div>
  </section>
</template>
