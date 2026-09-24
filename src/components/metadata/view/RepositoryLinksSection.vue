<script setup lang="ts">
// Repository links of one dataset: their state, the last pushed record and the
// actions a writer may take. Removing a link leaves the repository records.
import { computed, onUnmounted, ref, watch } from 'vue'
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
import Switch from '@/components/ui/Switch.vue'
import { isUnsupportedEndpoint, useAruna } from '@/composables/useAruna'
import { useGroupRights } from '@/composables/useInvenio'
import {
  ApiError,
  acceptRemoteLink,
  deleteInvenioLink,
  listInvenioLinks,
  patchInvenioLink,
  publishInvenioLink,
  pullInvenioLink,
  pushInvenioLink,
  rotateLinkToken,
  type InvenioLink,
  type TransferJobResponse,
} from '@/lib/api'
import {
  doiUrl,
  failureText,
  isPullLink,
  linkBusy,
  linkRights,
  linkStatus,
  managedHere,
  reviewText,
} from '@/lib/invenio'
import { getJob, isTerminalJobState, type JobState } from '@/lib/jobs'
import { follow, POLL_ACTIVE_MS } from '@/lib/poll'
import { errorMessage, relativeTime } from '@/lib/utils'
import { Library, Plus } from '@lucide/vue'

const props = defineProps<{ documentId: string; groupId: string; canWrite: boolean }>()
// settled: a push, publish or pull finished, so identifiers may have changed.
const emit = defineEmits<{ (e: 'publish'): void; (e: 'settled'): void }>()

const { apiBaseUrl, authToken, sessionEpoch } = useAruna()
const { userId, isAdmin } = useGroupRights(() => props.groupId)
function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

function rights(link: InvenioLink) {
  return linkRights(link, userId.value, isAdmin.value)
}

// Only the node that owns a link can act on it or show its jobs.
function here(link: InvenioLink): boolean {
  const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin
  return managedHere(link.owner_node_url, apiBaseUrl.value, origin)
}

const links = ref<InvenioLink[] | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
const hidden = ref(false)

// Per-link action state; the token draft lives only here and only while open.
const busyId = ref<string | null>(null)
const actionError = ref<Record<string, string>>({})
const startedJob = ref<Record<string, TransferJobResponse>>({})
// Last known state of each started job; missing means not read yet.
const jobState = ref<Record<string, JobState>>({})
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

async function load(silent = false) {
  const current = scope()
  if (!silent) loading.value = true
  if (!silent) loadError.value = null
  try {
    const list = await listInvenioLinks(props.documentId, client())
    if (!current()) return
    if (settledSince(links.value, list)) emit('settled')
    links.value = list
  } catch (err) {
    // A failed poll keeps the shown list; the next tick tries again.
    if (!current() || silent) return
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

defineExpose({ reload: () => load() })

// A link that stopped waiting or changed its published record ends a run.
function settledSince(before: InvenioLink[] | null, after: InvenioLink[]): boolean {
  return (before ?? []).some((old) => {
    const now = after.find((entry) => entry.link_id === old.link_id)
    if (!now) return false
    return (old.pending && !now.pending) || old.remote.doi !== now.remote.doi || old.remote.published !== now.remote.published
  })
}

function jobRunning(linkId: string): boolean {
  const job = startedJob.value[linkId]
  if (!job) return false
  const state = jobState.value[linkId]
  return !state || !isTerminalJobState(state)
}

const needsPoll = computed(
  () => (links.value ?? []).some(linkBusy) || Object.keys(startedJob.value).some(jobRunning),
)

async function poll() {
  const epoch = sessionEpoch.value
  let finished = false
  for (const [linkId, job] of Object.entries(startedJob.value)) {
    if (!jobRunning(linkId)) continue
    try {
      const answer = await getJob(job.job_id, client())
      if (epoch !== sessionEpoch.value || !startedJob.value[linkId]) return
      jobState.value = { ...jobState.value, [linkId]: answer.state }
      finished ||= isTerminalJobState(answer.state)
    } catch (err) {
      // A job that is gone stops being followed; other errors retry next tick.
      if (err instanceof ApiError && err.status === 404) jobState.value = { ...jobState.value, [linkId]: 'failed' }
    }
  }
  if (finished) emit('settled')
  await load(true)
}

const stopPoll = follow(poll, () => POLL_ACTIVE_MS, () => !needsPoll.value)
onUnmounted(stopPoll)

function resetActions() {
  busyId.value = null
  actionError.value = {}
  startedJob.value = {}
  jobState.value = {}
  confirming.value = null
  closeToken()
}

function closeToken() {
  tokenFor.value = null
  tokenDraft.value = ''
}

async function act(link: InvenioLink, work: () => Promise<TransferJobResponse | InvenioLink | void>) {
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
    if (job && 'job_id' in job) {
      startedJob.value = { ...startedJob.value, [link.link_id]: job }
      const states = { ...jobState.value }
      delete states[link.link_id]
      jobState.value = states
    }
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
const pull = (link: InvenioLink) => act(link, () => pullInvenioLink(props.documentId, link.link_id, client()))
const acceptRemote = (link: InvenioLink) => act(link, () => acceptRemoteLink(props.documentId, link.link_id, client()))
const setAutoUpdate = (link: InvenioLink, value: boolean) =>
  act(link, () => patchInvenioLink(props.documentId, link.link_id, { auto_update: value }, client()))
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

// Publishing while a push still runs would be refused, so it waits.
function canPublish(link: InvenioLink): boolean {
  return Boolean(link.remote.draft_id) && !link.pending && !jobRunning(link.link_id) && link.remote.review !== 'pending'
}

function reasonTone(link: InvenioLink): string {
  return link.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'
}
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
            <Badge v-if="isPullLink(link)" size="sm" variant="outline">Imports updates</Badge>
            <Badge v-if="link.pending" size="sm" variant="sky">{{ isPullLink(link) ? 'Update running' : 'Push waiting' }}</Badge>
            <Badge v-if="!isPullLink(link)" size="sm" :variant="link.remote.published ? 'success' : 'secondary'">
              {{ link.remote.published ? 'Published' : 'Not published' }}
            </Badge>
            <Badge v-if="reviewText(link.remote.review)" size="sm" :variant="link.remote.review === 'declined' ? 'destructive' : 'outline'">
              {{ reviewText(link.remote.review) }}
            </Badge>
            <Badge v-if="!isPullLink(link) && link.auto_publish" size="sm" variant="outline">Publishes automatically</Badge>
            <Badge v-if="isPullLink(link) && link.auto_update" size="sm" variant="outline">Updates automatically</Badge>
          </div>
          <p v-if="link.reason || link.status === 'failed'" class="text-xs" :class="reasonTone(link)">{{ failureText(link.reason) }}</p>
          <p v-if="link.warning" class="text-xs text-amber-700 dark:text-amber-400">{{ link.warning }}</p>

          <dl class="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
            <dt class="text-muted-foreground">DOI</dt>
            <dd class="flex min-w-0 flex-wrap items-center gap-1">
              <template v-if="link.remote.doi">
                <ExternalLink v-if="!link.remote.doi_reserved" :href="doiUrl(link.remote.doi)" :label="link.remote.doi" />
                <span v-else class="font-mono">{{ link.remote.doi }}</span>
                <CopyButton :value="link.remote.doi" label="Copy DOI" />
                <span v-if="link.remote.doi_reserved" class="text-muted-foreground">Reserved, becomes active when published.</span>
              </template>
              <span v-else class="text-muted-foreground">None yet</span>
            </dd>
            <template v-if="link.remote.concept_doi">
              <dt class="text-muted-foreground">All versions</dt>
              <dd class="flex min-w-0 items-center gap-1">
                <ExternalLink :href="doiUrl(link.remote.concept_doi)" :label="link.remote.concept_doi" />
                <CopyButton :value="link.remote.concept_doi" label="Copy concept DOI" />
              </dd>
            </template>
            <dt class="text-muted-foreground">Record</dt>
            <dd class="min-w-0">
              <ExternalLink v-if="link.remote.record_url" :href="link.remote.record_url" label="Open in the repository" />
              <span v-else-if="link.remote.record_id" class="font-mono">{{ link.remote.record_id }}</span>
              <span v-else class="text-muted-foreground">Not created yet</span>
            </dd>
            <template v-if="isPullLink(link)">
              <dt class="text-muted-foreground">Last checked</dt>
              <dd>{{ relativeTime(link.updated_at) }}</dd>
            </template>
            <dt class="text-muted-foreground">{{ isPullLink(link) ? 'Last update' : 'Last push' }}</dt>
            <dd>
              <template v-if="link.last_push">
                {{ relativeTime(link.last_push.pushed_at) }} ·
                <RouterLink v-if="here(link)" :to="{ name: 'job', params: { jobId: link.last_push.job_id } }" class="text-primary hover:underline">job</RouterLink>
                <span v-else class="font-mono">job {{ link.last_push.job_id }}</span>
              </template>
              <span v-else class="text-muted-foreground">None yet</span>
            </dd>
          </dl>

          <p v-if="!here(link)" class="text-xs text-muted-foreground">
            This link is managed by the node at <span class="font-mono">{{ link.owner_node_url }}</span>.
            Open the dataset on that node to change it or to see its jobs.
          </p>
          <p v-if="startedJob[link.link_id]" class="text-xs text-muted-foreground">
            {{ jobRunning(link.link_id) ? 'A' : 'Finished a' }}
            <RouterLink :to="{ name: 'job', params: { jobId: startedJob[link.link_id].job_id } }" class="text-primary hover:underline">job</RouterLink>
            for this link{{ jobRunning(link.link_id) ? ' is running.' : '.' }}
          </p>
          <p v-if="actionError[link.link_id]" class="text-xs text-destructive">{{ actionError[link.link_id] }}</p>

          <div v-if="canWrite && here(link) && rights(link).manage" class="flex flex-wrap items-center gap-2">
            <template v-if="confirming?.id === link.link_id && confirming.action === 'publish'">
              <span class="text-xs text-foreground">Publishing is permanent in the repository.</span>
              <Button size="sm" :disabled="busyId !== null || !canPublish(link)" @click="publish(link)">Publish</Button>
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
              <Button
                v-if="link.reason === 'remote_changed' && rights(link).owner"
                size="sm"
                :disabled="busyId !== null"
                @click="acceptRemote(link)"
              >
                Accept remote state
              </Button>
              <template v-if="isPullLink(link)">
                <Button
                  v-if="link.reason === 'update_available' || link.reason === 'local_changed'"
                  size="sm"
                  :disabled="busyId !== null || link.pending || jobRunning(link.link_id)"
                  @click="pull(link)"
                >
                  Update now
                </Button>
                <label v-if="rights(link).owner" class="flex items-center gap-2 text-xs text-foreground">
                  <Switch
                    :checked="Boolean(link.auto_update)"
                    :disabled="busyId !== null"
                    aria-label="Update automatically"
                    @update:checked="setAutoUpdate(link, $event)"
                  />
                  Update automatically
                </label>
              </template>
              <template v-else>
                <Button
                  variant="outline"
                  size="sm"
                  :disabled="busyId !== null || link.status === 'paused' || link.pending"
                  @click="push(link)"
                >
                  Push now
                </Button>
                <Button
                  v-if="rights(link).owner && link.remote.review !== 'pending'"
                  variant="outline"
                  size="sm"
                  :disabled="busyId !== null || !canPublish(link)"
                  :title="canPublish(link) ? undefined : 'Publish when the push has finished and a draft is open'"
                  @click="confirming = { id: link.link_id, action: 'publish' }"
                >
                  Publish
                </Button>
              </template>
              <Button variant="outline" size="sm" :disabled="busyId !== null" @click="togglePause(link)">
                {{ link.status === 'paused' ? 'Resume' : 'Pause' }}
              </Button>
              <Button v-if="rights(link).owner && !isPullLink(link)" variant="ghost" size="sm" :disabled="busyId !== null" @click="openToken(link)">
                Change token
              </Button>
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
