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
import { errorMessage } from '@/lib/utils'
import type { BucketSearchHit } from '@/lib/api'

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
  nodes,
  getTask,
  dataView,
  realmName: computed(() => realm.value.shortName),
})
const {
  groupId,
  task,
  hasScript,
  language,
  reuseSelectedScript,
  stagedScript,
  stagingBucket,
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

/**
 * Sends the run to this computer as a native job, which is the only surface
 * that accepts a local target. Answers false when the realm is the target.
 */
async function submitLocally(draft: TesTask): Promise<boolean> {
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
  const created = await submitJob({ ...mapping.request, target: 'local' }, client)
  void router.push({ name: 'run', params: { jobId: created.job_id } })
  return true
}

// A listing that keeps a failed node in its cursor ends only once that node answered.
const HOLDER_PAGES = 10

/** Every node holding a bucket of this name, of one group when given, read to the last page. */
async function bucketHolders(name: string, groupId?: string): Promise<string[]> {
  const nodes = new Set<string>()
  const sets: BucketSearchHit[] = []
  let cursor: string | undefined
  let pages = 0
  do {
    if (pages++ === HOLDER_PAGES) throw new Error(`Not every node answered, so the node holding bucket ${name} is unknown. Try again.`)
    const found = await searchBuckets(name, { limit: 50, cursor, groupId })
    // Older nodes ignore the group filter, so it is applied here as well.
    const hits = found.hits.filter((hit) => hit.bucket === name && isTarget(hit.node_id) && (!groupId || hit.group_id === groupId))
    for (const hit of hits) nodes.add(hit.node_id)
    sets.push(...hits.filter((hit) => hit.set_id))
    cursor = found.next_cursor ?? undefined
  } while (cursor)
  // The search shows a distributed bucket once; its node names every ready member.
  for (const hit of new Map(sets.map((entry) => [entry.set_id, entry])).values()) {
    const status = await getBucketDistribution(name, undefined, isLocalNode(hit.node_id) ? null : hit.node_id)
    for (const member of status.members) if (member.state === 'ready' && isTarget(member.node_id)) nodes.add(member.node_id)
  }
  return [...nodes]
}

/** Every current version below a key prefix on one node, read page by page. */
async function listedVersions(bucket: string, prefix: string, nodeId: string): Promise<{ key: string; versionId: string }[]> {
  const files: { key: string; versionId: string }[] = []
  let cursor: string | undefined
  do {
    const page = await listBucketObjects(bucket, { prefix, cursor, limit: 1000 }, isLocalNode(nodeId) ? null : nodeId)
    files.push(...page.objects.map((item) => ({ key: item.key, versionId: item.version_id })))
    cursor = page.next_cursor ?? undefined
  } while (cursor)
  return files
}

/** An input of another node, named by the exact versions it reads there; a folder becomes its files. */
async function pinInput(input: TesInput, holders: ReadonlyMap<string, readonly string[]>, realmId: string): Promise<TesInput[]> {
  const { bucket, key } = parseS3Url(input.url ?? '')!
  const node = [...(holders.get(bucket) ?? [])].sort()[0]
  if (!node) throw new Error(`No node holds bucket ${bucket}, so the run was not started.`)
  const pinned = (file: { key: string; versionId: string }) => versionObjectId(realmId, node, bucket, file.key, file.versionId)
  if (input.type !== 'DIRECTORY' && !key.endsWith('/')) {
    const file = (await listedVersions(bucket, key, node)).find((entry) => entry.key === key)
    if (!file) throw new Error(`${bucket}/${key} was not found on ${displayName(node)}, so the run was not started.`)
    return [{ ...input, url: pinned(file) }]
  }
  const prefix = key.endsWith('/') ? key : `${key}/`
  const files = await listedVersions(bucket, prefix, node)
  if (!files.length) throw new Error(`The folder ${bucket}/${prefix} is empty on ${displayName(node)}, so the run was not started.`)
  const base = input.path.replace(/\/+$/, '')
  return files.map((file) => {
    const relative = file.key.slice(prefix.length)
    return { ...input, name: relative, url: pinned(file), path: `${base}/${relative}`, type: 'FILE' as const }
  })
}

/** Inputs read from objects this page uploaded, bound to those versions on the upload node. */
function pinUploads(draft: TesTask, uploads: Array<{ key: string; versionId: string | null } | null>): TesTask {
  const done = uploads.filter((upload) => upload !== null)
  if (!done.length) return draft
  const realmId = nodeInfo.value?.node.realm_id
  const nodeId = s3.nodeIdFor()
  if (!realmId || !nodeId || done.some((upload) => !upload.versionId)) {
    throw new Error('The uploaded script has no exact version on its node, so the run was not started.')
  }
  const bucket = stagingBucket.value.trim()
  const pinned = new Map(done.map((upload) => [`s3://${bucket}/${upload.key}`, versionObjectId(realmId, nodeId, bucket, upload.key, upload.versionId!)]))
  return { ...draft, inputs: (draft.inputs ?? []).map((input) => (input.url && pinned.has(input.url) ? { ...input, url: pinned.get(input.url) } : input)) }
}

/** The run as the receiving node reads it, and that node's API; undefined keeps the connected node. */
async function routeRun(draft: TesTask): Promise<{ draft: TesTask; base: string | undefined }> {
  const { inputs, outputs } = taskBuckets(draft)
  const names = [...new Set([...inputs, ...outputs])]
  // Results are written to a bucket of the run's own group.
  const group = draft.tags?.[TES_GROUP_TAG]
  const holders = new Map(await Promise.all(names.map(async (name) =>
    [name, await bucketHolders(name, outputs.includes(name) ? group : undefined)] as const)))
  const missing = names.find((name) => !holders.get(name)?.length)
  if (missing) throw new Error(`No node holds bucket ${missing}, so the run was not started.`)
  const route = runRoute(draft, holders, localNodeId.value)
  if (!route) throw new Error('No node holds every result bucket of this run, so it was not started. Choose result buckets on one node.')
  if (route.pin.length) {
    const realmId = nodeInfo.value?.node.realm_id
    if (!realmId) throw new Error('The realm of this node is not known yet, so the run was not started. Try again.')
    const read = (input: TesInput) => {
      const bucket = parseS3Url(input.url ?? '')?.bucket
      return bucket && input.url?.startsWith('s3://') && route.pin.includes(bucket) ? pinInput(input, holders, realmId) : Promise.resolve([input])
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
  const sessionChanged = () => epoch !== sessionEpoch.value
  const fence = () => {
    if (sessionChanged()) throw new Error('The session changed while the run was being prepared, so it was not started.')
  }
  try {
    let draft = task.value
    const [scriptUpload, dependencyUpload] = await Promise.all([
      hasScript.value && !reuseSelectedScript.value
        ? s3.putTextObject(
            stagingBucket.value.trim(),
            normalizedScriptKey.value,
            stagedScript.value,
            language.value.contentType,
          )
        : Promise.resolve(null),
      dependencyConfig.value
        ? s3.putTextObject(
            stagingBucket.value.trim(),
            dependencyConfigKey.value,
            dependencyConfig.value,
            'application/json',
          )
        : Promise.resolve(null),
    ])
    if (runTarget.local.value) {
      const sourceNodeId = s3.nodeIdFor()
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
    if (await submitLocally(draft)) return
    // The uploads sit on the connected node; another node must read exactly those versions.
    draft = pinUploads(draft, [
      scriptUpload && { key: normalizedScriptKey.value, versionId: scriptUpload.versionId },
      dependencyUpload && { key: dependencyConfigKey.value, versionId: dependencyUpload.versionId },
    ])
    const routed = await routeRun(draft)
    fence()
    const created = await createTask(routed.draft, routed.base)
    void router.push({ name: 'task', params: { taskId: created.id } })
  } catch (err) {
    // A lookup cancelled by the session change is reported as that change.
    if (sessionChanged()) submitError.value = 'The session changed while the run was being prepared, so it was not started.'
    else submitError.value = isTesUnsupported(err) ? `This node does not accept runs. ${errorMessage(err)}` : errorMessage(err)
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
