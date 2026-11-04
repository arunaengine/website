<script setup lang="ts">
// Every S3 access key of this account in one table: the long-lived keys and the temporary S3
// sessions on the connected node. A node that does not list sessions yet (404/405) shows keys only.
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import RefusalNote from '@/components/ui/RefusalNote.vue'
import CreateCredentialDialog from '@/components/data/CreateCredentialDialog.vue'
import { isUnsupportedEndpoint, useAruna } from '@/composables/useAruna'
import {
  apiErrorMessage,
  listS3Sessions,
  revokeS3Session,
  type S3SessionSummary,
} from '@/lib/api'
import { relativeTime } from '@/lib/utils'
import { RouterLink } from 'vue-router'
import { Ban, Eye, EyeOff, KeyRound, Plus } from '@lucide/vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'

/** `keys`: also list and create the long-lived keys (the desktop lists them elsewhere). */
const props = withDefaults(defineProps<{ keys?: boolean; refreshRevision?: number }>(), { keys: true, refreshRevision: 0 })

const { apiBaseUrl, authToken, currentUser, myGroups, discoverableGroups, credentials, revokeS3Credential } = useAruna()

const sessions = ref<S3SessionSummary[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const unsupported = ref(false)
const busyIds = ref<string[]>([])
// The first steps link here with `create=key` to open the dialog at once.
const createOpen = ref(props.keys && useRoute()?.query.create === 'key')

function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

async function load() {
  if (!authToken.value) return
  loading.value = true
  error.value = null
  try {
    sessions.value = (await listS3Sessions(client())).sessions ?? []
  } catch (cause) {
    if (isUnsupportedEndpoint(cause)) unsupported.value = true
    else error.value = apiErrorMessage(cause)
  } finally {
    loading.value = false
  }
}

let loadedOnce = false
watch(currentUser, (user) => {
  if (!user || loadedOnce) return
  loadedOnce = true
  void load()
}, { immediate: true })

// The page header's refresh reads the list again.
watch(() => props.refreshRevision, () => {
  if (currentUser.value) void load()
})

const groupNames = computed(() => {
  const names = new Map<string, string>()
  for (const group of [...myGroups.value, ...discoverableGroups.value]) names.set(group.id, group.name)
  return names
})
const groupName = (id: string) => groupNames.value.get(id) ?? id.slice(0, 8)

// Revoked and expired keys stay listed by the node; they show on request.
const showInactive = ref(false)
const keyList = computed(() => (props.keys ? credentials.value : []))
const inactiveCount = computed(() => keyList.value.filter((key) => key.status !== 'active').length)
const shownKeys = computed(() => (showInactive.value ? keyList.value : keyList.value.filter((key) => key.status === 'active')))

interface KeyRow {
  id: string
  group: string
  groupId: string
  kind: 'Key' | 'Temporary'
  expires: string | null
  status: string
}
const rows = computed<KeyRow[]>(() => [
  ...shownKeys.value.map((key) => ({ id: key.access_key_id, group: groupName(key.group_id), groupId: key.group_id, kind: 'Key' as const, expires: key.expires_at, status: key.status })),
  ...sessions.value.map((session) => {
    const id = session.group_id ?? session.group?.id ?? ''
    const group = session.group_name ?? session.group?.name ?? groupName(id)
    return { id: session.access_key_id, group, groupId: id, kind: 'Temporary' as const, expires: session.expires_at ?? null, status: 'active' }
  }),
])

const expired = (iso: string | null) => Boolean(iso) && new Date(iso!).getTime() <= Date.now()

async function revoke(row: KeyRow) {
  busyIds.value = [...busyIds.value, row.id]
  error.value = null
  try {
    if (row.kind === 'Key') await revokeS3Credential(row.id)
    else {
      await revokeS3Session(row.id, client())
      sessions.value = sessions.value.filter((entry) => entry.access_key_id !== row.id)
    }
  } catch (cause) {
    error.value = apiErrorMessage(cause)
  } finally {
    busyIds.value = busyIds.value.filter((entry) => entry !== row.id)
  }
}
</script>

<template>
  <section v-if="keys || !unsupported" aria-labelledby="s3-keys-heading">
    <SectionHeading id="s3-keys-heading" title="S3 access keys" :icon="KeyRound" :level="3" info="Keys for command-line tools. A secret is shown once.">
      <template #actions>
        <Button v-if="inactiveCount" variant="outline" size="sm" @click="showInactive = !showInactive">
          <component :is="showInactive ? EyeOff : Eye" class="h-3.5 w-3.5" /> {{ showInactive ? 'Hide inactive' : `Show inactive (${inactiveCount})` }}
        </Button>
        <Button v-if="keys" variant="outline" size="sm" :disabled="!currentUser" @click="createOpen = true"><Plus class="h-3.5 w-3.5" /> Create key</Button>
      </template>
    </SectionHeading>
    <div class="surface overflow-hidden">

    <p v-if="!currentUser" class="px-5 py-6 text-xs text-muted-foreground">Sign in to see your S3 access keys.</p>
    <template v-else>
      <RefusalNote v-if="error" :message="error" class="mx-5 mt-4" />
      <div class="min-w-0 overflow-x-auto">
        <table class="data-table min-w-max">
          <thead>
            <tr>
              <th class="px-5 py-2 text-left font-semibold">Access key</th>
              <th class="px-5 py-2 text-left font-semibold">Group</th>
              <th class="px-5 py-2 text-left font-semibold">Kind</th>
              <th class="px-5 py-2 text-left font-semibold">Expires</th>
              <th class="px-5 py-2"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="`${row.kind}/${row.id}`" class="border-t border-border">
              <td class="px-5 py-2.5 font-mono text-xs text-foreground">{{ row.id }}</td>
              <td class="px-5 py-2.5 text-xs text-muted-foreground" :title="row.groupId">
                <RouterLink v-if="row.groupId" :to="{ name: 'group', params: { id: row.groupId } }" class="hover:text-foreground hover:underline">{{ row.group }}</RouterLink>
                <template v-else>{{ row.group }}</template>
              </td>
              <td class="px-5 py-2.5 text-xs text-muted-foreground">
                {{ row.kind }}
                <Badge v-if="row.status !== 'active'" size="sm" :variant="row.status === 'revoked' ? 'destructive' : 'secondary'" class="ml-1.5">{{ row.status }}</Badge>
              </td>
              <td class="px-5 py-2.5 text-xs" :class="expired(row.expires) ? 'text-destructive' : 'text-muted-foreground'">
                {{ !row.expires ? '-' : expired(row.expires) ? `expired ${relativeTime(row.expires)}` : relativeTime(row.expires) }}
              </td>
              <td class="px-5 py-2.5 text-right">
                <Button
                  v-if="row.status === 'active'"
                  variant="outline"
                  size="sm"
                  class="text-destructive hover:text-destructive"
                  :disabled="busyIds.includes(row.id)"
                  @click="revoke(row)"
                ><Ban class="h-3.5 w-3.5" /> Revoke</Button>
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td colspan="5" class="px-5 py-6 text-center text-xs text-muted-foreground">
                {{ loading ? 'Loading S3 access keys…' : 'No keys yet' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
    </div>
    <CreateCredentialDialog v-if="keys" v-model:open="createOpen" />
  </section>
</template>
