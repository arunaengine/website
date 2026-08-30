<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import ExternalLink from '@/components/ui/ExternalLink.vue'
import { useAruna } from '@/composables/useAruna'
import { useRefresh } from '@/composables/useRefresh'
import { ApiError } from '@/lib/api'
import { graphIriFor } from '@/lib/graphIri'
import { listPersistentIds, pidStateMeta, type PersistentIdView } from '@/lib/pid'
import { errorMessage } from '@/lib/utils'
import { Fingerprint } from '@lucide/vue'

const props = defineProps<{
  documentId: string
  isPublic: boolean
}>()

const { apiBaseUrl, authToken, currentUser } = useAruna()

function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

const view = ref<PersistentIdView | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
// A private document has no anonymous status: the route answers 404 rather
// than acting as an existence oracle.
const needsSignIn = ref(false)

let loadToken = 0
async function load() {
  const token = ++loadToken
  loading.value = true
  loadError.value = null
  needsSignIn.value = false
  try {
    const rows = await listPersistentIds(props.documentId, client())
    if (token !== loadToken) return
    view.value = rows[0] ?? null
  } catch (err) {
    if (token !== loadToken) return
    view.value = null
    if (err instanceof ApiError && err.status === 404 && !currentUser.value) needsSignIn.value = true
    else loadError.value = errorMessage(err)
  } finally {
    if (token === loadToken) loading.value = false
  }
}

watch(
  () => props.documentId,
  () => {
    view.value = null
    void load()
  },
  { immediate: true },
)

const { busy: refreshBusy, refresh: onRefresh } = useRefresh(load)
const spinning = computed(() => refreshBusy.value || loading.value)

const pid = computed(() => view.value?.value ?? graphIriFor(props.documentId))
const state = computed(() => view.value?.state ?? 'unknown')
const meta = computed(() => pidStateMeta(state.value))
</script>

<template>
  <section class="surface overflow-hidden">
    <header class="flex items-center justify-between gap-2 border-b border-border px-5 py-3.5">
      <div class="flex items-center gap-2 text-sm font-medium text-foreground">
        <Fingerprint class="h-4 w-4 text-primary" /> Persistent identifier
      </div>
      <RefreshButton :busy="spinning" sr-label="Re-check PID status" @click="onRefresh" />
    </header>

    <div class="space-y-3 p-5">
      <div class="flex flex-wrap items-center gap-2">
        <code class="min-w-0 break-all font-mono text-xs text-foreground">{{ pid }}</code>
        <CopyButton :value="pid" label="Copy PID" />
        <Skeleton v-if="loading" class="h-5 w-24" />
        <Badge v-else :variant="meta.variant">{{ meta.label }}</Badge>
      </div>

      <template v-if="!loading">
        <p v-if="needsSignIn" class="text-xs text-muted-foreground">
          Sign in to see the identifier status for this dataset.
        </p>
        <p v-else-if="loadError" class="text-xs text-muted-foreground">
          The identifier status could not be read ({{ loadError }}). Try again later.
        </p>
        <template v-else-if="view">
          <p v-if="state === 'requested' || state === 'processing'" class="text-xs text-muted-foreground">
            Registration runs automatically in the background on the PID authority; the identifier is
            not live until it finishes.
            <code v-if="view.job_id" class="ml-1 font-mono text-[11px]">{{ view.job_id }}</code>
          </p>
          <p v-else-if="state === 'active' && isPublic" class="text-xs text-muted-foreground">
            The identifier redirects anonymous visitors to this dataset's RO-Crate.
            <ExternalLink :href="pid" label="Open landing page" class="text-xs" />
          </p>
          <p v-else-if="state === 'active'" class="text-xs text-muted-foreground">
            The PID is registered, but the landing page only resolves datasets that are anonymously
            visible; it answers 404 until this dataset is made public.
          </p>
          <p v-else-if="state === 'failed'" class="text-xs text-muted-foreground">
            {{ view.failure?.message ?? 'Registration failed on the PID authority.' }}
            {{ view.failure?.retryable ? 'The authority retries it automatically.' : 'It needs administrator attention.' }}
          </p>
          <p v-else-if="state === 'admin-withdrawn'" class="text-xs text-muted-foreground">
            This identifier was withdrawn by a realm administrator: the landing page answers 410 Gone
            permanently and it cannot be reactivated.
          </p>
          <p v-else-if="state === 'tombstoned'" class="text-xs text-muted-foreground">
            The dataset was deleted; the identifier keeps a resolvable tombstone.
          </p>
          <p v-else class="text-xs text-muted-foreground">
            The PID authority cannot currently give a definitive record. Try again later.
          </p>
        </template>
      </template>
    </div>
  </section>
</template>
