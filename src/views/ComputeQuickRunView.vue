<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import WizardSteps from '@/components/onboarding/WizardSteps.vue'
import ComputeGates from '@/components/compute/ComputeGates.vue'
import RerunPrefillNote from '@/components/compute/RerunPrefillNote.vue'
import WizardNavBar from '@/components/compute/WizardNavBar.vue'
import TesDataRefDialog from '@/components/compute/TesDataRefDialog.vue'
import CreateCredentialDialog from '@/components/data/CreateCredentialDialog.vue'
import RuntimeStep from '@/components/compute/quick/RuntimeStep.vue'
import ScriptStep from '@/components/compute/quick/ScriptStep.vue'
import ReviewStep from '@/components/compute/quick/ReviewStep.vue'
import ScriptPickerDialog from '@/components/compute/quick/ScriptPickerDialog.vue'
import { useTes, isTesUnsupported } from '@/composables/useTes'
import { useAruna } from '@/composables/useAruna'
import { useComputeDataView } from '@/composables/useComputeDataView'
import { useQuickRun } from '@/composables/useQuickRun'
import { useRealm } from '@/composables/useRealm'
import { useRunTarget } from '@/composables/useRunTarget'
import { useS3 } from '@/composables/useS3'
import type { TesTask } from '@/lib/tes'
import { defaultPlacement, isNativeBlocked, tesFormToExecutionRequest } from '@/lib/nativeSubmit'
import { submitJob } from '@/lib/jobs'
import { errorMessage } from '@/lib/utils'
import { ArrowLeft } from '@lucide/vue'

const router = useRouter()
const route = useRoute()
const { tesEnabled, busy, createTask, getTask } = useTes()
const { currentUser, myGroups } = useAruna()
const { realm } = useRealm()
// Desktop only: this computer can run the script itself.
const runTarget = useRunTarget()
const s3 = useS3()
const dataView = useComputeDataView()

// One combined "Script & data" step: the selected data references are listed
// with their editable container mount paths (defaulting to /work/in and
// /work/out) right next to the editor, so container paths are visible while
// the script is written.
const WIZARD_STEPS = ['Runtime', 'Script & data', 'Review & run']
const REVIEW_STEP = 2
// The step lives in ?step=N so browser back/forward walks the wizard instead
// of leaving it.
const step = computed(() => {
  const raw = Number(route.query.step)
  return Number.isInteger(raw) && raw > 0 && raw < WIZARD_STEPS.length ? raw : 0
})
function goStep(target: number) {
  void router.push({ query: { ...route.query, step: target > 0 ? String(target) : undefined } })
}

const {
  runId,
  script,
  runtime,
  stagedScript,
  reuseSelectedScript,
  dependencyConfig,
  dependencyConfigKey,
  normalizedScriptKey,
  stagingBucket,
  groupId,
  task,
  workdirValid,
  dataReady,
  inputsValid,
  outputsValid,
  targetProblems,
  inputDialogOpen,
  inputMountDefault,
  credentialDialogOpen,
  addInput,
  rerunSource,
  rerunNotes,
  rerunError,
  rerunLoading,
  dismissRerun,
} = useQuickRun({
  runTarget,
  s3,
  myGroups,
  currentUser,
  getTask,
  dataView,
  realmName: computed(() => realm.value.shortName),
  goStep,
})

watch(step, (s) => {
  if (s === REVIEW_STEP) runId.value = crypto.randomUUID()
})

const canContinue = computed(() => {
  switch (step.value) {
    case 0:
      return workdirValid.value
    case 1:
      return script.value.trim().length > 0 && dataReady.value && inputsValid.value && outputsValid.value
    default:
      return true
  }
})
function next() {
  if (canContinue.value && step.value < WIZARD_STEPS.length - 1) goStep(step.value + 1)
}
// The first step's Back leaves the wizard, and the button says so.
function back() {
  if (step.value > 0) goStep(step.value - 1)
  else void router.push({ name: 'compute' })
}

// ── Submit ───────────────────────────────────────────────────────────────────
const submitting = ref(false)
const submitError = ref<string | null>(null)

/**
 * Sends the run to this computer as a native job, which is the only surface
 * that accepts a local target. Answers false when the realm is the target, and
 * reports its own refusal when the draft has no native form.
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

async function submit() {
  submitError.value = null
  submitting.value = true
  try {
    const reuseScript = reuseSelectedScript.value
    let submittedTask = task.value
    const [scriptUpload, dependencyUpload] = await Promise.all([
      !reuseScript
        ? s3.putTextObject(
            stagingBucket.value.trim(),
            normalizedScriptKey.value,
            stagedScript.value,
            runtime.value.contentType,
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
      const localInputs = [...(submittedTask.inputs ?? [])]
      if (scriptUpload?.versionId && localInputs[0]) {
        localInputs[0] = {
          ...localInputs[0],
          source_node_id: sourceNodeId,
          version_id: scriptUpload.versionId,
        }
      }
      if (dependencyUpload?.versionId && localInputs[1]) {
        localInputs[1] = {
          ...localInputs[1],
          source_node_id: sourceNodeId,
          version_id: dependencyUpload.versionId,
        }
      }
      if (localInputs.some((input) => !input.source_node_id || !input.version_id)) {
        throw new Error('Realm data inputs need an exact version for a local run.')
      }
      submittedTask = { ...submittedTask, inputs: localInputs }
    }
    if (await submitLocally(submittedTask)) return
    const created = await createTask(submittedTask)
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
    <PageHeader
      eyebrow="Compute"
      title="Quick run"
      description="Run a Python, JavaScript or Bash script with optional package dependencies, without describing a container by hand."
    >
      <template #actions>
        <Button variant="outline" size="sm" as-child>
          <RouterLink :to="{ name: 'compute' }"><ArrowLeft class="h-4 w-4" /> Back to Compute</RouterLink>
        </Button>
      </template>
    </PageHeader>

    <ComputeGates
      :enabled="tesEnabled"
      disabled-description="Set features.tes to true in portal-config.json for this deployment; Compute then targets any node that accepts runs."
      sign-in-title="Sign in to run a script"
      sign-in-description="Starting a run is an authenticated operation."
      redirect-to="/app/compute/quick"
    >
      <div class="container space-y-6 py-8">
        <RerunPrefillNote
          :loading="rerunLoading"
          :error="rerunError"
          :source="rerunSource"
          :notes="rerunNotes"
          @dismiss="dismissRerun"
        />

        <WizardSteps :steps="WIZARD_STEPS" :current="step" />

        <section class="surface space-y-5 p-6">
          <RuntimeStep v-if="step === 0" />
          <ScriptStep v-else-if="step === 1" />
          <ReviewStep v-else :submit-error="submitError" />
        </section>

        <WizardNavBar
          data-tour="quickrun-run"
          :first="step === 0"
          :last="step === WIZARD_STEPS.length - 1"
          :can-continue="canContinue"
          :can-run="!busy && !submitting && dataReady && inputsValid && outputsValid && !targetProblems.length"
          :running="submitting"
          @back="back"
          @next="next"
          @run="submit"
        />
      </div>
    </ComputeGates>

    <TesDataRefDialog v-model:open="inputDialogOpen" mode="input" :mount-default="inputMountDefault" @add="addInput" />
    <CreateCredentialDialog v-model:open="credentialDialogOpen" />

    <ScriptPickerDialog />
  </div>
</template>
