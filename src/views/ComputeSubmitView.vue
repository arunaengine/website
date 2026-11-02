<script setup lang="ts">
// The one run page: every part of a run on one form, with its summary beside it.
// No steps and no review page; the request is a dialog away.
import { computed, nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Notice from '@/components/ui/Notice.vue'
import AskAiButton from '@/components/assistant/AskAiButton.vue'
import ComputeGates from '@/components/compute/ComputeGates.vue'
import RerunPrefillNote from '@/components/compute/RerunPrefillNote.vue'
import TesDataRefDialog from '@/components/compute/TesDataRefDialog.vue'
import CreateCredentialDialog from '@/components/data/CreateCredentialDialog.vue'
import RunBasics from '@/components/compute/run/RunBasics.vue'
import ExecutorCard from '@/components/compute/run/ExecutorCard.vue'
import ScriptCard from '@/components/compute/run/ScriptCard.vue'
import FilesystemCard from '@/components/compute/run/FilesystemCard.vue'
import ResourcesCard from '@/components/compute/run/ResourcesCard.vue'
import PlacementCard from '@/components/compute/run/PlacementCard.vue'
import RunFooter from '@/components/compute/run/RunFooter.vue'
import RequestDialog from '@/components/compute/run/RequestDialog.vue'
import ScriptPickerDialog from '@/components/compute/run/ScriptPickerDialog.vue'
import SaveRunDialog from '@/components/compute/SaveRunDialog.vue'
import SavedRunStart from '@/components/compute/run/SavedRunStart.vue'
import { useTes, isTesUnsupported } from '@/composables/useTes'
import { useAruna } from '@/composables/useAruna'
import { useComputeDataView } from '@/composables/useComputeDataView'
import { useCustomRun } from '@/composables/useCustomRun'
import { useDatabases } from '@/composables/useDatabases'
import { useRealm } from '@/composables/useRealm'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useRunTarget } from '@/composables/useRunTarget'
import { useS3 } from '@/composables/useS3'
import { provideRunFormBridge } from '@/composables/useAssistantRunForm'
import { createRunFormBridge } from '@/lib/runFormBridge'
import { defaultPlacement, isNativeBlocked, tesFormToExecutionRequest } from '@/lib/nativeSubmit'
import { submitJob } from '@/lib/jobs'
import { TES_GROUP_TAG, nativeInput, parseS3Url, runRoute, taskBuckets, type TesInput, type TesTask } from '@/lib/tes'
import { versionObjectId } from '@/lib/contentIdentity'
import { fromStatus, keyHolder, type DistributedBucket } from '@/lib/distribution'
import { errorMessage } from '@/lib/utils'
import { ApiError, type BucketSearchHit } from '@/lib/api'

const router = useRouter()
const { tesEnabled, busy, createTask, getTask } = useTes()
const { currentUser, myGroups, nodeInfo, searchBuckets, getBucketDistribution, listBucketObjects, sessionEpoch } = useAruna()
const { realm } = useRealm()
const { nodes, nodeById, localNodeId, isTarget, isLocalNode, displayName } = useRealmNodes()
// Desktop only: this computer can run the container itself.
const runTarget = useRunTarget()
const s3 = useS3()
const dataView = useComputeDataView()

const store = useCustomRun({
  runTarget,
  s3,
  myGroups,
  currentUser,
  searchBuckets,
  nodes,
  isTarget,
  isLocalNode,
  getTask,
  dataView,
  realmName: computed(() => realm.value.shortName),
  databases: useDatabases(),
})
const {
  groupId,
  task,
  hasScript,
  language,
  reuseSelectedScript,
  stagedScript,
  stagingBucket,
  stagingNode,
  normalizedScriptKey,
  dependencyConfig,
  dependencyConfigKey,
  problems,
  inputDialogOpen,
  inputMountDefault,
  credentialDialogOpen,
  addInputEntry,
  rerunSource,
  rerunNotes,
  rerunError,
  rerunLoading,
  dismissRerun,
  savedStart,
  savedError,
} = store

// The assistant may read and change this form while the page is open.
provideRunFormBridge(createRunFormBridge(store))

const resourcesCard = ref<InstanceType<typeof ResourcesCard> | null>(null)
const placementCard = ref<InstanceType<typeof PlacementCard> | null>(null)
const requestOpen = ref(false)
const saveOpen = ref(false)
const savedRun = ref(false)
// A new script is stored only when the run starts, so a saved run could not find it yet.
const saveBlocked = computed(() =>
  hasScript.value && !reuseSelectedScript.value ? 'The script is stored when the run starts. Start the run once, then save it from its details.' : null,
)
const submitting = ref(false)
const submitError = ref<string | null>(null)

const endpoint = computed(() => (runTarget.local.value ? 'POST /jobs/' : 'POST /ga4gh/tes/v1/tasks'))
const sentTo = computed(() =>
  runTarget.local.value
    ? 'sent to this computer, which runs the container itself'
    : 'sent to the node that holds its buckets; the planner picks the executing node',
)

/** Scrolls to a problem and puts the caret in the field that carries it. */
function jumpTo(section: string, field: string) {
  if (section === 'section-resources') resourcesCard.value?.open()
  if (section === 'section-placement') placementCard.value?.open()
  const page = globalThis.document
  page?.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  void nextTick(() => {
    const target = page?.getElementById(field)
    if (!target) return
    const focusable =
      target.matches('input, select, textarea, button, [tabindex]')
        ? target
        : target.querySelector<HTMLElement>('input, select, textarea, button, [tabindex]')
    focusable?.focus()
  })
}

/** One press of Run: whether its request left the page, and whether its session still holds. */
interface Submission {
  sent: boolean
  current: () => boolean
}

/**
 * Sends the run to this computer as a native job, which is the only surface
 * that accepts a local target. Answers false when the realm is the target.
 */
async function submitLocally(draft: TesTask, submission: Submission): Promise<boolean> {
  const client = runTarget.localClient.value
  if (!client) return false
  const mapping = tesFormToExecutionRequest({
    groupId: groupId.value,
    task: draft,
    placement: defaultPlacement(),
  })
  if (isNativeBlocked(mapping)) {
    submitError.value = mapping.blocked
    return true
  }
  submission.sent = true
  const created = await submitJob({ ...mapping.request, target: 'local' }, client)
  if (submission.current()) void router.push({ name: 'run', params: { jobId: created.job_id } })
  return true
}

// A listing that keeps a failed node in its cursor ends only once that node answered.
const HOLDER_PAGES = 10

/** Every node holding a bucket of this name, of one group when given, read to the last page. */
async function bucketHolders(name: string, groupId?: string): Promise<{ nodes: string[]; partial: boolean; ranges: DistributedBucket[] }> {
  const nodes = new Set<string>()
  let partial = false
  const sets: BucketSearchHit[] = []
  const ranges: DistributedBucket[] = []
  let cursor: string | undefined
  let pages = 0
  do {
    if (pages++ === HOLDER_PAGES) throw new Error(`Not every node answered, so the node holding bucket ${name} is unknown. Try again.`)
    const found = await searchBuckets(name, { limit: 50, cursor, groupId })
    if (found.nodes_failed) partial = true
    // Older nodes ignore the group filter, so it is applied here as well.
    const hits = found.hits.filter((hit) => hit.bucket === name && isTarget(hit.node_id) && (!groupId || hit.group_id === groupId))
    for (const hit of hits) nodes.add(hit.node_id)
    sets.push(...hits.filter((hit) => hit.set_id))
    cursor = found.next_cursor ?? undefined
  } while (cursor)
  // The search shows a distributed bucket once; its node names every ready member.
  for (const hit of new Map(sets.map((entry) => [entry.set_id, entry])).values()) {
    const status = await getBucketDistribution(name, undefined, isLocalNode(hit.node_id) ? null : hit.node_id)
    ranges.push(fromStatus(status))
    for (const member of status.members) if (member.state === 'ready' && isTarget(member.node_id)) nodes.add(member.node_id)
  }
  return { nodes: [...nodes], partial, ranges }
}

/** Every current version below a key prefix on one node; `stale` when a lagging copy answered. */
async function listedVersions(bucket: string, prefix: string, nodeId: string) {
  const files: { key: string; versionId: string }[] = []
  let stale = false
  let cursor: string | undefined
  do {
    const page = await listBucketObjects(bucket, { prefix, cursor, limit: 1000 }, isLocalNode(nodeId) ? null : nodeId)
    files.push(...page.objects.map((item) => ({ key: item.key, versionId: item.version_id })))
    if (page.stale_ranges?.length) stale = true
    cursor = page.next_cursor ?? undefined
  } while (cursor)
  return { files, stale }
}

/** An input of another node, named by the exact versions it reads there; a folder becomes its files. */
async function pinInput(input: TesInput, holders: ReadonlyMap<string, readonly string[]>, realmId: string, sets: readonly DistributedBucket[] = []): Promise<TesInput[]> {
  const { bucket, key } = parseS3Url(input.url ?? '')!
  const node = [...(holders.get(bucket) ?? [])].sort()[0]
  if (!node) throw new Error(`No node holds bucket ${bucket}, so the run was not started.`)
  // A key of a distributed bucket is pinned on the node that holds its range, within the chosen node's set.
  const ranges = sets.find((set) => set.members.some((member) => member.nodeId === node))
  const holder = (file: { key: string }) => (ranges && keyHolder(ranges, file.key)) || node
  const pinned = (file: { key: string; versionId: string }) => versionObjectId(realmId, holder(file), bucket, file.key, file.versionId)
  if (input.type !== 'DIRECTORY' && !key.endsWith('/')) {
    const file = (await listedVersions(bucket, key, node)).files.find((entry) => entry.key === key)
    if (!file) throw new Error(`${bucket}/${key} was not found on ${displayName(node)}, so the run was not started.`)
    return [{ ...input, url: pinned(file) }]
  }
  const prefix = key.endsWith('/') ? key : `${key}/`
  const listed = await listedVersions(bucket, prefix, node)
  const stale = listed.stale
  // A key ending in a slash marks a folder and holds no file.
  const files = listed.files.filter((file) => !file.key.endsWith('/'))
  // A copy that lags may miss recent files, so the folder is not taken as complete.
  if (stale) {
    throw new Error(`Part of ${bucket}/${prefix} on ${displayName(node)} is listed from a copy that may miss recent files, so the run was not started. Try again later, or pick its files.`)
  }
  if (!files.length) throw new Error(`The folder ${bucket}/${prefix} is empty on ${displayName(node)}, so the run was not started.`)
  const base = input.path.replace(/\/+$/, '')
  return files.map((file) => {
    const relative = file.key.slice(prefix.length)
    return { ...input, name: relative, url: pinned(file), path: `${base}/${relative}`, type: 'FILE' as const }
  })
}

/** Where this page uploads the run's files, read once before the upload starts. */
interface UploadTarget {
  bucket: string
  scriptKey: string
  dependencyKey: string
  nodeId: string | null
}

/** Inputs read from objects this page uploaded, bound to those versions on the upload node. */
function pinUploads(draft: TesTask, target: UploadTarget, uploads: Array<{ key: string; versionId: string | null } | null>): TesTask {
  const done = uploads.filter((upload) => upload !== null)
  if (!done.length) return draft
  const realmId = nodeInfo.value?.node.realm_id
  const { bucket, nodeId } = target
  if (!realmId || !nodeId || done.some((upload) => !upload.versionId)) {
    throw new Error('The uploaded script has no exact version on its node, so the run was not started.')
  }
  const pinned = new Map(done.map((upload) => [`s3://${bucket}/${upload.key}`, versionObjectId(realmId, nodeId, bucket, upload.key, upload.versionId!)]))
  return { ...draft, inputs: (draft.inputs ?? []).map((input) => (input.url && pinned.has(input.url) ? { ...input, url: pinned.get(input.url) } : input)) }
}

/** The run as the receiving node reads it, and that node's API; undefined keeps the connected node. */
async function routeRun(draft: TesTask): Promise<{ draft: TesTask; base: string | undefined }> {
  const { inputs, outputs } = taskBuckets(draft)
  const names = [...new Set([...inputs, ...outputs])]
  // Results are written to a bucket of the run's own group.
  const group = draft.tags?.[TES_GROUP_TAG]
  const found = new Map(await Promise.all(names.map(async (name) =>
    [name, await bucketHolders(name, outputs.includes(name) ? group : undefined)] as const)))
  const holders = new Map([...found].map(([name, entry]) => [name, entry.nodes] as const))
  // A node that did not answer may hold what is missing, so the lookup is unknown, not empty.
  const unavailable = (name: string) =>
    new Error(`The bucket lookup did not reach every node, so the node holding ${name} is unknown. The run was not started; try again.`)
  const missing = names.find((name) => !holders.get(name)?.length)
  if (missing) throw found.get(missing)!.partial ? unavailable(missing) : new Error(`No node holds bucket ${missing}, so the run was not started.`)
  const route = runRoute(draft, holders, localNodeId.value)
  const partial = outputs.find((name) => found.get(name)!.partial)
  if (!route && partial) throw unavailable(partial)
  if (!route) throw new Error('No node holds every result bucket of this run, so it was not started. Choose result buckets on one node.')
  if (route.pin.length) {
    const realmId = nodeInfo.value?.node.realm_id
    if (!realmId) throw new Error('The realm of this node is not known yet, so the run was not started. Try again.')
    const read = (input: TesInput) => {
      const bucket = parseS3Url(input.url ?? '')?.bucket
      return bucket && input.url?.startsWith('s3://') && route.pin.includes(bucket) ? pinInput(input, holders, realmId, found.get(bucket)?.ranges) : Promise.resolve([input])
    }
    draft = { ...draft, inputs: (await Promise.all((draft.inputs ?? []).map(read))).flat() }
  }
  if (!route.node) return { draft, base: undefined }
  const base = nodeById(route.node)?.apiBase
  if (!base) throw new Error(`${displayName(route.node)} holds the run's buckets but names no API address, so the run was not started.`)
  return { draft, base }
}

async function run() {
  if (problems.value.length) {
    jumpTo(problems.value[0].section, problems.value[0].field)
    return
  }
  submitError.value = null
  submitting.value = true
  // The draft belongs to the session it was started in; another account must not send it.
  const epoch = sessionEpoch.value
  const submission: Submission = { sent: false, current: () => epoch === sessionEpoch.value }
  const fence = () => {
    if (!submission.current()) throw new Error('The session changed while the run was being prepared, so it was not started.')
  }
  try {
    let draft = task.value
    // The draft names these keys; an edit while the upload runs must not change what is pinned.
    // A staging bucket on another node gets the files through that node's own session.
    const remote = stagingNode.value
    const reference = remote ? await s3.referenceForNode(remote, groupId.value) : undefined
    const target: UploadTarget = {
      bucket: stagingBucket.value.trim(),
      scriptKey: normalizedScriptKey.value,
      dependencyKey: dependencyConfigKey.value,
      nodeId: remote ?? s3.nodeIdFor(),
    }
    const put = (key: string, text: string, type: string) =>
      remote ? s3.putTextObject(target.bucket, key, text, type, remote, reference) : s3.putTextObject(target.bucket, key, text, type)
    const [scriptUpload, dependencyUpload] = await Promise.all([
      hasScript.value && !reuseSelectedScript.value
        ? put(target.scriptKey, stagedScript.value, language.value.contentType)
        : Promise.resolve(null),
      dependencyConfig.value
        ? put(target.dependencyKey, dependencyConfig.value, 'application/json')
        : Promise.resolve(null),
    ])
    if (runTarget.local.value) {
      const sourceNodeId = target.nodeId
      if (!sourceNodeId) throw new Error('The realm node for staged inputs is not available.')
      const localInputs = (draft.inputs ?? []).map(nativeInput)
      if (scriptUpload?.versionId && localInputs[0]) {
        localInputs[0] = { ...localInputs[0], source_node_id: sourceNodeId, version_id: scriptUpload.versionId }
      }
      if (dependencyUpload?.versionId && localInputs[1]) {
        localInputs[1] = { ...localInputs[1], source_node_id: sourceNodeId, version_id: dependencyUpload.versionId }
      }
      if (localInputs.some((input) => !input.source_node_id || !input.version_id)) {
        throw new Error('Realm data inputs need an exact version for a local run.')
      }
      draft = { ...draft, inputs: localInputs }
    }
    fence()
    if (await submitLocally(draft, submission)) return
    // The uploads sit on the staging bucket's node; another node must read exactly those versions.
    draft = pinUploads(draft, target, [
      scriptUpload && { key: target.scriptKey, versionId: scriptUpload.versionId },
      dependencyUpload && { key: target.dependencyKey, versionId: dependencyUpload.versionId },
    ])
    const routed = await routeRun(draft)
    fence()
    submission.sent = true
    const created = await createTask(routed.draft, routed.base)
    if (submission.current()) void router.push({ name: 'task', params: { taskId: created.id } })
  } catch (err) {
    // A sent request of an earlier session is not this page's to report.
    if (!submission.current()) {
      if (!submission.sent) submitError.value = 'The session changed while the run was being prepared, so it was not started.'
      return
    }
    // Only a node's refusal says a sent run did not start; anything else leaves it unknown.
    if (submission.sent && !(err instanceof ApiError && err.status < 500)) {
      submitError.value = `The run was sent, but its answer did not arrive (${errorMessage(err)}). It may have started: check the run list before starting it again.`
      return
    }
    submitError.value = isTesUnsupported(err) ? `This node does not accept runs. ${errorMessage(err)}` : errorMessage(err)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader title="New run" :crumbs="[{ label: 'New run' }]" :docs="{ topic: 'compute-run', section: 'One page, six sections' }">
      <template #actions>
        <AskAiButton prompt="Help me set up this run." subject="the run form" icon-only />
      </template>
    </PageHeader>

    <ComputeGates
      :enabled="tesEnabled"
      disabled-description="Set features.tes to true in portal-config.json for this deployment; Compute then targets any node that accepts runs."
      sign-in-title="Sign in to start a run"
      sign-in-description="Starting a run is an authenticated operation."
      redirect-to="/app/compute/new"
    >
      <div class="grid w-full items-start gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
        <div class="min-w-0 space-y-6">
          <RerunPrefillNote
            :loading="rerunLoading"
            :error="rerunError"
            :source="rerunSource"
            :notes="rerunNotes"
            @dismiss="dismissRerun"
          />

          <Notice v-if="savedError" tone="error">{{ savedError }}</Notice>
          <SavedRunStart v-if="savedStart" />
          <template v-else>
            <RunBasics />
            <ExecutorCard />
            <ScriptCard v-if="hasScript" />
            <FilesystemCard />
            <ResourcesCard ref="resourcesCard" />
          </template>
          <PlacementCard ref="placementCard" />

          <Notice v-if="submitError" tone="error">{{ submitError }}</Notice>
        </div>

        <RunFooter
          :running="submitting || busy"
          :saved="savedRun"
          :error="submitError"
          @run="run"
          @cancel="router.push({ name: 'compute' })"
          @save="saveOpen = true"
          @show-request="requestOpen = true"
          @jump="jumpTo"
        />
      </div>
    </ComputeGates>

    <RequestDialog v-model:open="requestOpen" :endpoint="endpoint" :sent-to="sentTo" />
    <TesDataRefDialog v-model:open="inputDialogOpen" mode="input" :mount-default="inputMountDefault" @add="addInputEntry" />
    <CreateCredentialDialog v-model:open="credentialDialogOpen" />
    <ScriptPickerDialog />
    <SaveRunDialog v-model:open="saveOpen" :task="task" :blocked="saveBlocked" @saved="savedRun = true" />
  </div>
</template>
