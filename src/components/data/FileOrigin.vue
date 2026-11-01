<script setup lang="ts">
// Where a file version came from, as the node recorded it when the version was made. A sync adds
// the version it copied from. The ids and what a dataset may say about the file wait in Details.
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import OriginLine from '@/components/data/OriginLine.vue'
import ProvenanceView from '@/components/data/ProvenanceView.vue'
import Button from '@/components/ui/Button.vue'
import DetailDialog from '@/components/ui/DetailDialog.vue'
import GlobalId from '@/components/distributed/GlobalId.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useAruna } from '@/composables/useAruna'
import { useFileOrigin, type OriginTarget } from '@/composables/useFileOrigin'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useTes } from '@/composables/useTes'
import { useUserDirectory } from '@/composables/useUserDirectory'
import { TES_STATE_META, type TesState } from '@/lib/tes'
import { CircleCheck, CircleX, LoaderCircle } from '@lucide/vue'
import { s3ErrorMessage, useS3 } from '@/composables/useS3'
import { ARUNA_CONTENT_W3ID_PREFIX, versionObjectId } from '@/lib/contentIdentity'
import { hopFrom, originFrom, projectionRows } from '@/lib/fileOrigin'
import type { OriginResponse } from '@/lib/api'
import type { ProvenanceStart } from '@/lib/provenance'
import { shortUserId, truncateMiddle } from '@/lib/utils'

const props = defineProps<{ target: OriginTarget }>()
// The answer goes to the details above, which show the identifiers in it.
const emit = defineEmits<{ (e: 'origin', value: OriginResponse | null): void }>()

const { displayName, localNodeId } = useRealmNodes()
const s3 = useS3()
const found = useFileOrigin(computed(() => props.target))
watch(() => found.origin.value, (value) => emit('origin', value), { immediate: true })
// An upload and a run's starter name their user by id; the shared directory gives the name, the
// short id stays the fallback.
const userDir = useUserDirectory()
watch(() => [found.origin.value?.created_by, startedBy(found.origin.value)], (ids) => {
  const wanted = ids.filter((id): id is string => Boolean(id))
  if (wanted.length) void userDir.resolveUsers(wanted)
}, { immediate: true })
function startedBy(answer: OriginResponse | null | undefined): string | null {
  return answer?.origin?.kind === 'job' ? (answer.origin.started_by ?? null) : null
}

const origin = computed(() =>
  found.origin.value
    ? originFrom(found.origin.value, {
        user: (id) => userDir.cachedUser(id)?.name || shortUserId(id),
        node: displayName,
        backend: (id) => truncateMiddle(id, 8, 4),
      })
    : null,
)
const hop = computed(() => (found.origin.value ? hopFrom(found.origin.value) : null))
const rows = computed(() => projectionRows(found.origin.value?.projection ?? []))
// The exact id the provenance view starts from: the global id, else this node's versioned id.
const { realmInfo } = useAruna()
const showing = ref(false)
const fileName = computed(() => props.target.key.split('/').pop() || props.target.key)
const startId = computed(() => {
  const answer = found.origin.value
  const realm = realmInfo.value?.realm_id
  if (!answer) return null
  if (answer.global_id) return answer.global_id
  const node = props.target.node ?? localNodeId.value
  if (!realm || !node) return null
  return `${ARUNA_CONTENT_W3ID_PREFIX}${versionObjectId(realm, node, props.target.bucket, props.target.key, answer.version_id)}`
})
// One start object per answer, so a re-render keeps what the view has read.
const start = computed<ProvenanceStart | null>(() => {
  const origin = found.origin.value
  return origin && startId.value ? { kind: 'file', id: startId.value, name: fileName.value, origin } : null
})
// The version downloads through this session's short-lived signed URL, never with the token in a URL.
const downloadError = ref<string | null>(null)
async function download() {
  const version = found.origin.value?.version_id
  if (!version) return
  downloadError.value = null
  try {
    const name = props.target.key.split('/').pop() || props.target.key
    const anchor = document.createElement('a')
    anchor.href = await s3.downloadUrl(props.target.bucket, props.target.key, props.target.node ?? null, version, name)
    anchor.download = name
    anchor.rel = 'noopener'
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
  } catch (cause) {
    downloadError.value = s3ErrorMessage(cause)
  }
}
// The run that wrote the file, read once per answer: its name and state for one chip that opens
// the run. A run that cannot be read keeps the id line below.
const { getRun, sessionEpoch } = useAruna()
const { getTask } = useTes()
const run = ref<{ taskId: string; name: string; state: TesState } | null>(null)
let runRead = 0
watch(() => found.origin.value, async (answer) => {
  const read = ++runRead
  const epoch = sessionEpoch.value
  run.value = null
  const origin = answer?.origin
  if (origin?.kind !== 'job') return
  const record = await getRun(origin.run_id).catch(() => null)
  const taskId = record?.logical_job_id
  const task = taskId ? await getTask(taskId, 'BASIC').catch(() => null) : null
  if (read !== runRead || epoch !== sessionEpoch.value || !taskId || !task) return
  run.value = { taskId, name: task.name || origin.run_id, state: task.state ?? 'UNKNOWN' }
}, { immediate: true })
const RUNNING: TesState[] = ['QUEUED', 'INITIALIZING', 'RUNNING', 'PAUSED', 'CANCELING']
const runMark = computed(() => {
  const state = run.value?.state
  if (!state || state === 'UNKNOWN') return null
  const label = TES_STATE_META[state].label
  if (state === 'COMPLETE') return { icon: CircleCheck, color: 'text-status-ok', label }
  if (RUNNING.includes(state)) return { icon: LoaderCircle, color: 'text-status-running motion-safe:animate-spin', label }
  return { icon: CircleX, color: 'text-status-failed', label }
})
// A version minted without a record is said so, never guessed.
const recorded = computed(() => Boolean(origin.value || hop.value))
</script>

<template>
  <section v-if="found.state.value !== 'missing'" class="space-y-2 border-t border-border pt-4">
    <h3 class="text-sm font-medium text-foreground">Origin</h3>
    <Spinner v-if="found.state.value === 'loading'" label="Reading the origin" />
    <p v-else-if="found.state.value === 'failed'" class="text-xs text-muted-foreground">The origin could not be read: {{ found.error.value }}</p>
    <template v-else>
      <div class="space-y-0.5 text-xs">
        <p v-if="run" class="flex flex-wrap items-center gap-1.5">
          Written by
          <RouterLink
            :to="{ name: 'task', params: { taskId: run.taskId } }"
            class="inline-flex items-center gap-1.5 rounded-md border border-border-subtle px-2 py-0.5 text-foreground hover:border-primary/40"
          >
            <component :is="runMark.icon" v-if="runMark" :class="['size-3.5 shrink-0', runMark.color]" role="img" :aria-label="runMark.label" />
            {{ run.name }}
          </RouterLink>
          <span v-if="origin?.kind === 'job' && origin.startedBy">Started by {{ origin.startedBy }}</span>
        </p>
        <OriginLine v-else-if="origin" short :origin="origin" />
        <OriginLine v-if="hop" short :origin="hop" />
        <p v-if="!recorded" class="text-muted-foreground">Not recorded for this version.</p>
      </div>
      <div v-if="startId">
        <Button size="sm" variant="outline" @click="showing = true">Show provenance</Button>
      </div>
      <DetailDialog v-if="start" :open="showing" @update:open="(open) => (showing = open)">
        <template #header>
          <h2 class="font-display text-lg font-semibold text-aruna-navy">Provenance</h2>
          <p class="text-xs text-muted-foreground">{{ fileName }}</p>
        </template>
        <ProvenanceView v-if="showing" :start="start" />
      </DetailDialog>
      <div v-if="found.origin.value?.global_id" class="space-y-1.5 text-xs">
        <p class="text-muted-foreground">
          Id of this version. It names no node: the URL downloads the file from a holder that the node chooses.
          Send your token with the request unless the file is public.
        </p>
        <GlobalId :global-url="found.origin.value.global_id" />
        <button type="button" class="text-primary hover:underline" @click="download">Download this version</button>
        <p v-if="downloadError" class="text-destructive">{{ downloadError }}</p>
      </div>
      <details v-if="recorded" class="border-t border-border pt-3 text-xs">
        <summary class="cursor-pointer text-sm font-medium text-foreground">Details</summary>
        <div class="mt-3 space-y-4">
          <div>
            <p class="mb-1 text-muted-foreground">Added to datasets as</p>
            <ul v-if="rows.length" class="space-y-1">
              <li v-for="row in rows" :key="row.key" class="flex items-center gap-2">
                <template v-if="row.property === 'CreateAction'">
                  <span class="min-w-0 flex-1">
                    Produced by the run
                    <RouterLink :to="{ name: 'compute', query: { tab: 'jobs' } }" class="font-mono text-primary hover:underline">{{ row.value }}</RouterLink>
                  </span>
                </template>
                <template v-else-if="row.property === 'identifier'">
                  <span class="shrink-0 text-muted-foreground">identifier</span>
                  <a :href="row.url" target="_blank" rel="noopener noreferrer" class="min-w-0 flex-1 break-all font-mono text-primary hover:underline">{{ row.value }}</a>
                </template>
                <template v-else>
                  <span class="shrink-0 text-muted-foreground">isBasedOn</span>
                  <span class="min-w-0 flex-1 break-all font-mono">{{ row.value }}</span>
                </template>
              </li>
            </ul>
            <p v-else class="text-muted-foreground">Nothing: uploads, storage folders and users stay out of datasets.</p>
          </div>
        </div>
      </details>
    </template>
  </section>
</template>
