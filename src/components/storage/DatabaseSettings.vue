<script setup lang="ts">
// Whether this bucket is a database: the dataset that describes it, the mark, and the agreement
// of the group that owns the bucket. Marking needs the databases right; removing needs it too,
// or admin rights on the owning group.
import { computed, onMounted, ref } from 'vue'
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
import { requestOf, STATE_NOTES, targetOf } from '@/lib/databases'
import { Database } from '@lucide/vue'

const props = defineProps<{
  bucket: string
  nodeId: string | null
  /** The set of the bucket; null for an ordinary bucket, undefined while it is not known. */
  setId?: string | null
  groupName?: string | null
  canAdmin: boolean
}>()

const { listDatabases, removeDatabase } = useAruna()
const { localNodeId } = useRealmNodes()
const databases = useDatabases()
const requests = useDatabaseRequests()

// The curator view answers 403 to a user without the databases right.
const curate = ref<'unknown' | 'yes' | 'no'>('unknown')
const asking = ref(false)
const failure = ref<string | null>(null)

onMounted(async () => {
  databases.ensure()
  requests.ensure()
  try {
    await listDatabases({ curation: true, limit: 1 })
    curate.value = 'yes'
  } catch (cause) {
    curate.value = cause instanceof ApiError && cause.status === 403 ? 'no' : 'unknown'
  }
})

const entry = computed(() => databases.find(props.bucket, props.nodeId))
const known = computed(() => props.setId !== undefined)
const pending = computed(() => {
  const node = props.nodeId ?? localNodeId.value
  return known.value && node ? requestOf(requests.requests.value, targetOf(props.bucket, node, props.setId ?? null)) : undefined
})

async function remove() {
  if (!entry.value) return
  failure.value = null
  try {
    await removeDatabase(entry.value.entryId)
  } catch (cause) {
    failure.value = apiErrorMessage(cause)
  }
  await databases.reload()
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
        <DatabaseHeader bare :bucket="bucket" :node-id="nodeId" />
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
      <template v-else>
        <p class="text-muted-foreground">Not a database.</p>
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
            @done="asking = false"
          />
        </template>
      </template>
      <Notice v-if="failure" tone="error">{{ failure }}</Notice>
    </div>
  </section>
</template>
