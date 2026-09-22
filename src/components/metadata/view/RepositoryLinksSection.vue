<script setup lang="ts">
// Repository links of one dataset: their state, the last pushed record and the
// actions a writer may take. Removing a link leaves the repository records.
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import ExternalLink from '@/components/ui/ExternalLink.vue'
import Input from '@/components/ui/Input.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { isUnsupportedEndpoint, useAruna } from '@/composables/useAruna'
import {
  ApiError,
  deleteInvenioLink,
  listInvenioLinks,
  patchInvenioLink,
  publishInvenioLink,
  pushInvenioLink,
  rotateLinkToken,
  type InvenioLink,
  type TransferJobResponse,
} from '@/lib/api'
import { doiUrl, failureText, linkStatus } from '@/lib/invenio'
import { errorMessage, relativeTime } from '@/lib/utils'
import { Library, Plus } from '@lucide/vue'

const props = defineProps<{ documentId: string; canWrite: boolean }>()
const emit = defineEmits<{ (e: 'publish'): void }>()

const { apiBaseUrl, authToken, sessionEpoch } = useAruna()
function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

const links = ref<InvenioLink[] | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
const hidden = ref(false)

// Per-link action state; the token draft lives only here and only while open.
const busyId = ref<string | null>(null)
const actionError = ref<Record<string, string>>({})
const startedJob = ref<Record<string, TransferJobResponse>>({})
const confirming = ref<{ id: string; action: 'publish' | 'remove' } | null>(null)
const tokenFor = ref<string | null>(null)
const tokenDraft = ref('')

// Every answer is bound to the document, the session and the latest request.
let generation = 0
function scope() {
  const current = ++generation
  const epoch = sessionEpoch.value
  const documentId = props.documentId
  return () => current === generation && epoch === sessionEpoch.value && documentId === props.documentId
}

async function load() {
  const current = scope()
  loading.value = true
  loadError.value = null
  try {
    const list = await listInvenioLinks(props.documentId, client())
    if (current()) links.value = list
  } catch (err) {
    if (!current()) return
    links.value = null
    const refused = err instanceof ApiError && err.status === 403
    if (refused || isUnsupportedEndpoint(err)) hidden.value = true
    else loadError.value = errorMessage(err)
  } finally {
    if (current()) loading.value = false
  }
}

watch(
  [() => props.documentId, sessionEpoch],
  () => {
    links.value = null
    hidden.value = false
    resetActions()
    void load()
  },
  { immediate: true },
)

defineExpose({ reload: load })

function resetActions() {
  busyId.value = null
  actionError.value = {}
  startedJob.value = {}
  confirming.value = null
  closeToken()
}

function closeToken() {
  tokenFor.value = null
  tokenDraft.value = ''
}

async function act(link: InvenioLink, work: () => Promise<TransferJobResponse | void>) {
  if (busyId.value) return
  const epoch = sessionEpoch.value
  const documentId = props.documentId
  busyId.value = link.link_id
  confirming.value = null
  const errors = { ...actionError.value }
  delete errors[link.link_id]
  actionError.value = errors
  try {
    const job = await work()
    if (epoch !== sessionEpoch.value || documentId !== props.documentId) return
    if (job) startedJob.value = { ...startedJob.value, [link.link_id]: job }
    await load()
  } catch (err) {
    if (epoch === sessionEpoch.value && documentId === props.documentId) {
      actionError.value = { ...actionError.value, [link.link_id]: errorMessage(err) }
    }
  } finally {
    busyId.value = null
  }
}

const push = (link: InvenioLink) => act(link, () => pushInvenioLink(props.documentId, link.link_id, client()))
const publish = (link: InvenioLink) => act(link, () => publishInvenioLink(props.documentId, link.link_id, client()))
const togglePause = (link: InvenioLink) =>
  act(link, async () => {
    await patchInvenioLink(props.documentId, link.link_id, { paused: link.status !== 'paused' }, client())
  })
const remove = (link: InvenioLink) =>
  act(link, async () => {
    await deleteInvenioLink(props.documentId, link.link_id, client())
  })

function saveToken(link: InvenioLink) {
  const token = tokenDraft.value.trim()
  closeToken()
  if (!token) return
  void act(link, () => rotateLinkToken(props.documentId, link.link_id, token, client()))
}

function openToken(link: InvenioLink) {
  tokenDraft.value = ''
  tokenFor.value = link.link_id
}

const ordered = computed(() => links.value ?? [])
</script>

<template>
  <section v-if="!hidden" class="surface overflow-hidden">
    <header class="flex items-center justify-between gap-2 border-b border-border px-5 py-3.5">
      <div class="flex items-center gap-2 text-sm font-medium text-foreground">
        <Library class="h-4 w-4 text-primary" /> Repositories
      </div>
      <RefreshButton :busy="loading" sr-label="Reload repository links" @click="load" />
    </header>

    <div class="p-5">
      <Skeleton v-if="loading && !links" class="h-16" />
      <ErrorPanel v-else-if="loadError" :message="loadError" @retry="load" />
      <EmptyState
        v-else-if="links && !links.length"
        compact
        title="Not linked to a repository."
        :description="canWrite ? 'Publish it to Invenio or Zenodo to get a DOI from the repository.' : undefined"
      >
        <Button v-if="canWrite" size="sm" variant="outline" @click="emit('publish')">
          <Plus class="h-3.5 w-3.5" /> Publish to repository
        </Button>
      </EmptyState>
      <ul v-else-if="links" class="space-y-4">
        <li v-for="link in ordered" :key="link.link_id" class="space-y-2 rounded-md border border-border p-3">
          <div class="flex flex-wrap items-center gap-2">
            <span class="min-w-0 truncate font-mono text-xs text-foreground">{{ link.endpoint }}</span>
            <Badge size="sm" :variant="linkStatus(link).variant">{{ linkStatus(link).label }}</Badge>
            <Badge v-if="link.pending" size="sm" variant="sky">Push waiting</Badge>
            <Badge size="sm" :variant="link.remote.published ? 'success' : 'secondary'">
              {{ link.remote.published ? 'Published' : 'Not published' }}
            </Badge>
            <Badge v-if="link.auto_publish" size="sm" variant="outline">Publishes automatically</Badge>
          </div>
          <p v-if="link.status === 'failed'" class="text-xs text-destructive">{{ failureText(link.reason) }}</p>

          <dl class="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
            <dt class="text-muted-foreground">DOI</dt>
            <dd class="flex min-w-0 items-center gap-1">
              <template v-if="link.remote.doi">
                <ExternalLink :href="doiUrl(link.remote.doi)" :label="link.remote.doi" />
                <CopyButton :value="link.remote.doi" label="Copy DOI" />
              </template>
              <span v-else class="text-muted-foreground">None yet</span>
            </dd>
            <dt class="text-muted-foreground">Record</dt>
            <dd class="min-w-0">
              <ExternalLink v-if="link.remote.record_url" :href="link.remote.record_url" label="Open in the repository" />
              <span v-else-if="link.remote.record_id" class="font-mono">{{ link.remote.record_id }}</span>
              <span v-else class="text-muted-foreground">Not created yet</span>
            </dd>
            <dt class="text-muted-foreground">Last push</dt>
            <dd>
              <template v-if="link.last_push">
                {{ relativeTime(link.last_push.pushed_at) }} ·
                <RouterLink :to="{ name: 'job', params: { jobId: link.last_push.job_id } }" class="text-primary hover:underline">job</RouterLink>
              </template>
              <span v-else class="text-muted-foreground">None yet</span>
            </dd>
          </dl>

          <p v-if="startedJob[link.link_id]" class="text-xs text-muted-foreground">
            Started a
            <RouterLink :to="{ name: 'job', params: { jobId: startedJob[link.link_id].job_id } }" class="text-primary hover:underline">job</RouterLink>
            for this link.
          </p>
          <p v-if="actionError[link.link_id]" class="text-xs text-destructive">{{ actionError[link.link_id] }}</p>

          <div v-if="canWrite" class="flex flex-wrap items-center gap-2">
            <template v-if="confirming?.id === link.link_id && confirming.action === 'publish'">
              <span class="text-xs text-foreground">Publishing is permanent in the repository.</span>
              <Button size="sm" :disabled="busyId !== null" @click="publish(link)">Publish</Button>
              <Button variant="ghost" size="sm" @click="confirming = null">Cancel</Button>
            </template>
            <template v-else-if="confirming?.id === link.link_id && confirming.action === 'remove'">
              <span class="text-xs text-foreground">Remove the link and its token? Records in the repository stay.</span>
              <Button variant="destructive" size="sm" :disabled="busyId !== null" @click="remove(link)">Remove</Button>
              <Button variant="ghost" size="sm" @click="confirming = null">Cancel</Button>
            </template>
            <form v-else-if="tokenFor === link.link_id" class="flex flex-wrap items-center gap-2" @submit.prevent="saveToken(link)">
              <Input
                v-model="tokenDraft"
                type="password"
                autocomplete="new-password"
                aria-label="New personal access token"
                class="h-8 w-56 font-mono text-xs"
              />
              <Button type="submit" size="sm" :disabled="!tokenDraft.trim()">Save token</Button>
              <Button type="button" variant="ghost" size="sm" @click="closeToken">Cancel</Button>
              <span class="basis-full text-[11px] text-muted-foreground">
                Stored sealed for this repository endpoint and never shown again.
              </span>
            </form>
            <template v-else>
              <Button variant="outline" size="sm" :disabled="busyId !== null || link.status === 'paused'" @click="push(link)">
                Push now
              </Button>
              <Button
                variant="outline"
                size="sm"
                :disabled="busyId !== null || !link.remote.draft_id"
                :title="link.remote.draft_id ? undefined : 'There is no open draft to publish'"
                @click="confirming = { id: link.link_id, action: 'publish' }"
              >
                Publish
              </Button>
              <Button variant="outline" size="sm" :disabled="busyId !== null" @click="togglePause(link)">
                {{ link.status === 'paused' ? 'Resume' : 'Pause' }}
              </Button>
              <Button variant="ghost" size="sm" :disabled="busyId !== null" @click="openToken(link)">Change token</Button>
              <Button
                variant="ghost"
                size="sm"
                class="text-destructive hover:text-destructive"
                :disabled="busyId !== null"
                @click="confirming = { id: link.link_id, action: 'remove' }"
              >
                Remove link
              </Button>
            </template>
          </div>
        </li>
      </ul>
      <Button v-if="canWrite && links?.length" variant="outline" size="sm" class="mt-3" @click="emit('publish')">
        <Plus class="h-3.5 w-3.5" /> Add another repository
      </Button>
    </div>
  </section>
</template>
