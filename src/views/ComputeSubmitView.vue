<script setup lang="ts">
// The one run page: every part of a run on one form, with the footer at its
// end. No steps and no review page; the request is a dialog away.
import { computed, nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
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
import type { TesTask } from '@/lib/tes'
import { errorMessage } from '@/lib/utils'
import { ArrowLeft } from '@lucide/vue'

const router = useRouter()
const { tesEnabled, busy, createTask, getTask } = useTes()
const { currentUser, myGroups } = useAruna()
const { realm } = useRealm()
const { nodes } = useRealmNodes()
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
} = store

// The assistant may read and change this form while the page is open.
provideRunFormBridge(createRunFormBridge(store))

const resourcesCard = ref<InstanceType<typeof ResourcesCard> | null>(null)
const placementCard = ref<InstanceType<typeof PlacementCard> | null>(null)
const requestOpen = ref(false)
const submitting = ref(false)
const submitError = ref<string | null>(null)

const endpoint = computed(() => (runTarget.local.value ? 'POST /jobs/' : 'POST /ga4gh/tes/v1/tasks'))
const sentTo = computed(() =>
  runTarget.local.value
    ? 'sent to this computer, which runs the container itself'
    : 'sent to the node you are signed in to; the planner picks the executing node',
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

async function run() {
  if (problems.value.length) {
    jumpTo(problems.value[0].section, problems.value[0].field)
    return
  }
  submitError.value = null
  submitting.value = true
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
      const localInputs = [...(draft.inputs ?? [])]
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
    if (await submitLocally(draft)) return
    const created = await createTask(draft)
    void router.push({ name: 'task', params: { taskId: created.id } })
  } catch (err) {
    submitError.value = isTesUnsupported(err)
      ? `This node does not accept runs. ${errorMessage(err)}`
      : errorMessage(err)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader eyebrow="Compute" title="New run">
      <template #actions>
        <AskAiButton size="default" prompt="Help me set up this run." />
        <Button variant="outline" size="default" as-child>
          <RouterLink :to="{ name: 'compute' }"><ArrowLeft class="h-4 w-4" /> Back to Compute</RouterLink>
        </Button>
      </template>
    </PageHeader>

    <ComputeGates
      :enabled="tesEnabled"
      disabled-description="Set features.tes to true in portal-config.json for this deployment; Compute then targets any node that accepts runs."
      sign-in-title="Sign in to start a run"
      sign-in-description="Starting a run is an authenticated operation."
      redirect-to="/app/compute/new"
    >
      <div class="container max-w-5xl space-y-4 py-8">
        <RerunPrefillNote
          :loading="rerunLoading"
          :error="rerunError"
          :source="rerunSource"
          :notes="rerunNotes"
          @dismiss="dismissRerun"
        />

        <RunBasics />
        <ExecutorCard />
        <ScriptCard v-if="hasScript" />
        <FilesystemCard />
        <ResourcesCard ref="resourcesCard" />
        <PlacementCard ref="placementCard" />

        <Notice v-if="submitError" tone="error">{{ submitError }}</Notice>

        <RunFooter
          :running="submitting || busy"
          @run="run"
          @cancel="router.push({ name: 'compute' })"
          @show-request="requestOpen = true"
          @jump="jumpTo"
        />
      </div>
    </ComputeGates>

    <RequestDialog v-model:open="requestOpen" :endpoint="endpoint" :sent-to="sentTo" />
    <TesDataRefDialog v-model:open="inputDialogOpen" mode="input" :mount-default="inputMountDefault" @add="addInputEntry" />
    <CreateCredentialDialog v-model:open="credentialDialogOpen" />
    <ScriptPickerDialog />
  </div>
</template>
