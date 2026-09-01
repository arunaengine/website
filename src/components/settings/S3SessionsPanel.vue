<script setup lang="ts">
// The temporary S3 sessions this account holds on the connected node. Nodes
// that do not serve the list yet answer 404/405, and the panel stays hidden.
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import RefusalNote from '@/components/ui/RefusalNote.vue'
import { isUnsupportedEndpoint, useAruna } from '@/composables/useAruna'
import {
  apiErrorMessage,
  listS3Sessions,
  revokeS3Session,
  type S3SessionSummary,
} from '@/lib/api'
import { relativeTime } from '@/lib/utils'

const { apiBaseUrl, authToken, currentUser, myGroups, discoverableGroups } = useAruna()

const sessions = ref<S3SessionSummary[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const unsupported = ref(false)
const busyIds = ref<string[]>([])

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

const groupNames = computed(() => {
  const names = new Map<string, string>()
  for (const group of [...myGroups.value, ...discoverableGroups.value]) names.set(group.id, group.name)
  return names
})

function groupLabel(session: S3SessionSummary): string {
  const id = session.group_id ?? session.group?.id ?? ''
  return session.group_name ?? session.group?.name ?? groupNames.value.get(id) ?? id.slice(0, 8)
}

async function revoke(accessKeyId: string) {
  busyIds.value = [...busyIds.value, accessKeyId]
  error.value = null
  try {
    await revokeS3Session(accessKeyId, client())
    sessions.value = sessions.value.filter((entry) => entry.access_key_id !== accessKeyId)
  } catch (cause) {
    error.value = apiErrorMessage(cause)
  } finally {
    busyIds.value = busyIds.value.filter((entry) => entry !== accessKeyId)
  }
}
</script>

<template>
  <section v-if="!unsupported" class="surface overflow-hidden">
    <header class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
      <div class="min-w-0">
        <h3 class="font-display text-sm font-semibold text-aruna-navy">Temporary S3 sessions</h3>
        <p class="text-xs text-muted-foreground">
          The in-memory S3 sessions the portal and your other clients opened on this node. Revoking one stops that key immediately.
        </p>
      </div>
      <RefreshButton :busy="loading" sr-label="Refresh S3 sessions" @click="load" />
    </header>

    <p v-if="!currentUser" class="px-5 py-6 text-xs text-muted-foreground">Sign in to see your S3 sessions.</p>
    <template v-else>
      <RefusalNote v-if="error" :message="error" class="mx-5 mt-4" />
      <div class="min-w-0 overflow-x-auto">
        <table class="w-full min-w-max text-sm">
          <thead class="bg-muted/20 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th class="px-5 py-2 text-left font-semibold">Access key</th>
              <th class="px-5 py-2 text-left font-semibold">Group</th>
              <th class="px-5 py-2 text-left font-semibold">Expires</th>
              <th class="px-5 py-2"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="session in sessions" :key="session.access_key_id" class="border-t border-border">
              <td class="px-5 py-2.5 font-mono text-[11px] text-foreground">{{ session.access_key_id }}</td>
              <td class="px-5 py-2.5 text-[11px] text-muted-foreground">{{ groupLabel(session) }}</td>
              <td class="px-5 py-2.5 text-[11px] text-muted-foreground">
                {{ session.expires_at ? relativeTime(session.expires_at) : 'unknown' }}
              </td>
              <td class="px-5 py-2.5 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  class="text-destructive hover:text-destructive"
                  :disabled="busyIds.includes(session.access_key_id)"
                  @click="revoke(session.access_key_id)"
                >Revoke</Button>
              </td>
            </tr>
            <tr v-if="!sessions.length">
              <td colspan="4" class="px-5 py-6 text-center text-xs text-muted-foreground">
                {{ loading ? 'Loading S3 sessions…' : 'No temporary S3 sessions on this node.' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>
