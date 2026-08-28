<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import WizardSteps from '@/components/onboarding/WizardSteps.vue'
import ComputeGates from '@/components/compute/ComputeGates.vue'
import RerunPrefillNote from '@/components/compute/RerunPrefillNote.vue'
import WizardNavBar from '@/components/compute/WizardNavBar.vue'
import TesDataRefDialog from '@/components/compute/TesDataRefDialog.vue'
import BasicsStep from '@/components/compute/custom/BasicsStep.vue'
import WorkloadStep from '@/components/compute/custom/WorkloadStep.vue'
import ReviewStep from '@/components/compute/custom/ReviewStep.vue'
import { useTes, isTesUnsupported } from '@/composables/useTes'
import { useAruna } from '@/composables/useAruna'
import { useComputeDataView } from '@/composables/useComputeDataView'
import { useCustomRun } from '@/composables/useCustomRun'
import { useRealm } from '@/composables/useRealm'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useRunTarget } from '@/composables/useRunTarget'
import { useS3 } from '@/composables/useS3'
import { isNativeBlocked, tesFormToExecutionRequest } from '@/lib/nativeSubmit'
import {
  isNativeSubmitUnsupported,
  isSubmitRetryable,
  submitErrorMessage,
  submitJob,
} from '@/lib/jobs'
import { createOperationId } from '@/lib/placementPolicies'
import { errorMessage } from '@/lib/utils'
import { ArrowLeft } from '@lucide/vue'

const router = useRouter()
const route = useRoute()
const { tesEnabled, busy, createTask, getTask } = useTes()
const { apiBaseUrl, authToken, myGroups } = useAruna()
const { realm } = useRealm()
const { executorKinds } = useRealmNodes()
// Desktop only: this computer can run the container itself.
const runTarget = useRunTarget()
const s3 = useS3()
const dataView = useComputeDataView()

const {
  groupId,
  task,
  placement,
  executorConstraint,
  executorsValid,
  outputsValid,
  workspaceValid,
  cpuCoresValid,
  ramGbValid,
  diskGbValid,
  nativeInvalid,
  useNative,
  targetProblems,
  rerunSource,
  rerunNotes,
  rerunError,
  rerunLoading,
  dismissRerun,
  inputDialogOpen,
  inputMountDefault,
  addInputEntry,
} = useCustomRun({
  runTarget,
  s3,
  myGroups,
  executorKinds,
  getTask,
  dataView,
  realmName: computed(() => realm.value.shortName),
})

const WIZARD_STEPS = ['Basics', 'Workload', 'Review & run']
// The step lives in ?step=N so browser back/forward walks the wizard instead
// of leaving it.
const step = computed(() => {
  const raw = Number(route.query.step)
  return Number.isInteger(raw) && raw > 0 && raw < WIZARD_STEPS.length ? raw : 0
})
function goStep(target: number) {
  void router.push({ query: { ...route.query, step: target > 0 ? String(target) : undefined } })
}

const canContinue = computed(() => {
  switch (step.value) {
    case 0:
      return groupId.value.length > 0
    case 1:
      return (
        groupId.value.length > 0 &&
        executorsValid.value &&
        outputsValid.value &&
        workspaceValid.value &&
        cpuCoresValid.value &&
        ramGbValid.value &&
        diskGbValid.value
      )
    default:
      return groupId.value.length > 0
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
const submitError = ref<string | null>(null)
// Set instead of navigating away when the node dropped the workspace choice,
// so the hint is actually seen; the task itself was submitted fine.
const submittedWithoutWorkspace = ref<string | null>(null)
// Held across retries: a 503 may already have committed the submission, so the
// same key is what makes the retry a replay instead of a duplicate.
const idempotencyKey = ref('')
const submitRetryable = ref(false)

async function submitNative() {
  const mapping = tesFormToExecutionRequest({
    groupId: groupId.value,
    task: task.value,
    executorConstraint: executorConstraint.value,
    placement: placement.value,
    idempotencyKey: idempotencyKey.value,
  })
  if (isNativeBlocked(mapping)) {
    submitError.value = mapping.blocked
    return
  }
  const local = runTarget.localClient.value
  const created = await submitJob(
    local ? { ...mapping.request, target: 'local' } : mapping.request,
    local ?? { baseUrl: apiBaseUrl.value, token: authToken.value },
  )
  void router.push(
    local
      ? { name: 'run', params: { jobId: created.job_id } }
      : { name: 'job', params: { jobId: created.job_id } },
  )
}

async function submit() {
  submitError.value = null
  submitRetryable.value = false
  if (!idempotencyKey.value) idempotencyKey.value = createOperationId()
  try {
    if (useNative.value) {
      await submitNative()
      return
    }
    const created = await createTask(task.value)
    if (created.workspaceIgnored) {
      submittedWithoutWorkspace.value = created.id
      return
    }
    void router.push({ name: 'task', params: { taskId: created.id } })
  } catch (err) {
    if (useNative.value) {
      submitRetryable.value = isSubmitRetryable(err)
      submitError.value = isNativeSubmitUnsupported(err)
        ? 'This node does not serve the native jobs API, so these advanced options cannot be used here.'
        : submitErrorMessage(err)
      return
    }
    submitError.value = isTesUnsupported(err)
      ? `This node does not accept runs. ${errorMessage(err)}`
      : errorMessage(err)
  }
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Compute"
      title="Custom run"
      description="Describe a container run: image, command, data and resources."
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
      sign-in-title="Sign in to start a run"
      sign-in-description="Starting a run is an authenticated operation."
      redirect-to="/app/compute/new"
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
          <BasicsStep v-if="step === 0" />
          <WorkloadStep v-else-if="step === 1" />
          <ReviewStep
            v-else
            :submit-error="submitError"
            :submit-retryable="submitRetryable"
            :submitted-without-workspace="submittedWithoutWorkspace"
          />
        </section>

        <WizardNavBar
          :first="step === 0"
          :last="step === WIZARD_STEPS.length - 1"
          :can-continue="canContinue"
          :can-run="!busy && !!groupId && executorsValid && outputsValid && workspaceValid && cpuCoresValid && ramGbValid && diskGbValid && !nativeInvalid && !submittedWithoutWorkspace && !targetProblems.length"
          @back="back"
          @next="next"
          @run="submit"
        />
      </div>
    </ComputeGates>

    <!-- Input picker for the filesystem tree's per-folder add-input action;
         the Table view's TesInputsEditor keeps its own dialog. -->
    <TesDataRefDialog v-model:open="inputDialogOpen" mode="input" :mount-default="inputMountDefault" @add="addInputEntry" />
  </div>
</template>
