<script setup lang="ts">
// The compute tutorial: the real run page and the real run detail,
// driven by a seeded draft and answered from fixtures. Nothing reaches a node
// while the session runs, and leaving the route ends it.
import { computed, onUnmounted, provide, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import ComputeSubmitView from '@/views/ComputeSubmitView.vue'
import TaskDetailPanel from '@/components/compute/TaskDetailPanel.vue'
import Notice from '@/components/ui/Notice.vue'
import { useAruna } from '@/composables/useAruna'
import { CUSTOM_RUN, createCustomRun } from '@/composables/useCustomRun'
import { JOB_CLIENT } from '@/composables/useJobs'
import { useRealm } from '@/composables/useRealm'
import { useRunTarget } from '@/composables/useRunTarget'
import { S3_SOURCE } from '@/composables/useS3'
import { useTes } from '@/composables/useTes'
import { useOnboarding } from '@/composables/useOnboarding'
import type { Group } from '@/data/types'
import {
  DATASET_PREFIX,
  INPUT_BUCKET,
  INPUT_OBJECTS,
  RESULT_BUCKET,
  TUTORIAL_GROUP,
  TUTORIAL_NODE_ID,
} from '@/lib/tutorial/fixtures/data'
import type { RealmNodeDisplay } from '@/composables/useRealmNodes'
import { TUTORIAL_TASK_ID, runStageLabel } from '@/lib/tutorial/fixtures/run'
import { tutorialApi } from '@/lib/tutorial/services/tutorialApi'
import { tutorialJobClient } from '@/lib/tutorial/services/tutorialJobClient'
import { tutorialS3 } from '@/lib/tutorial/services/tutorialS3'
import {
  PICKER_STEP_IDS,
  TUTORIAL_RUN_ROUTE,
  computeTutorialSteps,
} from '@/lib/tutorial/steps/compute'
import {
  exitTutorial,
  startTutorial,
  syncTutorialRoute,
  tutorialData,
  tutorialStatus,
  tutorialStep,
} from '@/lib/tutorial/session'

const route = useRoute()
const router = useRouter()
const { currentUser } = useAruna()
const { realm } = useRealm()
const { getTask } = useTes()
const { markTutorialDone } = useOnboarding()

// One made-up node, so placement has something to match against.
const TUTORIAL_NODES: RealmNodeDisplay[] = [
  {
    nodeId: TUTORIAL_NODE_ID,
    kind: 'server',
    info: {
      labels: { region: 'practice' },
      executors: [{ kind: 'docker', file_staging: true, direct_s3: false }],
      urls: {},
      utilization: { storage_bytes_used: 0, heartbeat_at_ms: 0 },
      updated_at_ms: 0,
    },
    label: 'Practice node',
    s3Url: null,
    apiBase: null,
    reachable: true,
    isLocal: false,
    executorKinds: ['docker'],
  },
]

const s3 = tutorialS3(currentUser.value?.id ?? 'tutorial-user')
provide(S3_SOURCE, s3)
provide(JOB_CLIENT, tutorialJobClient)

const groups = computed<Group[]>(() => [
  {
    id: TUTORIAL_GROUP.id,
    realmId: realm.value.id,
    name: TUTORIAL_GROUP.name,
    slug: 'tutorial-group',
    description: 'A practice group that exists only in this tutorial.',
    createdAt: '',
    quotaBytes: 0,
    usedBytes: 0,
    ownerId: currentUser.value?.id ?? '',
    tags: [],
  },
])

// The run page's own store, seeded with a draft worth reading, then provided so
// ComputeSubmitView adopts it instead of building an empty one.
const store = createCustomRun({
  runTarget: useRunTarget(),
  s3,
  myGroups: groups,
  currentUser,
  nodes: computed(() => TUTORIAL_NODES),
  getTask,
  dataView: ref('tree'),
  realmName: computed(() => realm.value.shortName),
})
provide(CUSTOM_RUN, store)

// Restart puts the draft back the way the tutorial found it.
function seedDraft() {
  store.name.value = 'merge-station-readings'
  store.description.value = 'Merge two stations of survey readings into one summary.'
  store.groupId.value = TUTORIAL_GROUP.id
  store.useCustomImage()
  store.inputs.value = INPUT_OBJECTS.map((object) => ({
    kind: 'file' as const,
    url: `s3://${INPUT_BUCKET}/${object.key}`,
    path: `/inputs/${object.name}`,
    name: object.name,
  }))
  store.image.value = 'python:3.12-slim'
  store.commandLine.value = 'python /inputs/merge.py'
  store.markTouched('image')
  store.markTouched('command')
  store.outputRows.value = [
    { path: '/outputs/summary.json', bucket: RESULT_BUCKET, key: 'runs/summary.json', keyTouched: true },
    { path: '/outputs/plot.png', bucket: RESULT_BUCKET, key: 'runs/plot.png', keyTouched: true },
  ]
  store.cpuCores.value = 2
  store.ramGb.value = 4
  store.diskGb.value = 10
  store.inputMountDefault.value = `/inputs/${DATASET_PREFIX}`
}
seedDraft()

startTutorial({ id: 'compute', steps: computeTutorialSteps, api: tutorialApi, reset: seedDraft })

const showRun = computed(() => route.query.stage === 'run')
const stageLabel = computed(() => runStageLabel(tutorialData.value.runState))

// Reaching the run stage through the card instead of the Run button still
// shows a run: the default draft is submitted to the tutorial's own API.
watch(showRun, (on) => {
  if (on && !tutorialData.value.runState) void tutorialApi('/ga4gh/tes/v1/tasks', { method: 'POST' })
}, { immediate: true })

// The picker is a step of its own, so the tutorial opens it and closes it again.
watch(
  () => tutorialStep.value?.id,
  (id) => {
    store.inputDialogOpen.value = !!id && PICKER_STEP_IDS.includes(id)
  },
)

watch(() => route.fullPath, syncTutorialRoute)

// Finishing records the tutorial; finishing or leaving it hands the reader
// back to Compute, so this route is never left standing without a session.
watch(tutorialStatus, (status) => {
  if (status === 'running') return
  if (status === 'done') {
    exitTutorial()
    void markTutorialDone('compute')
  }
  void router.push({ name: 'compute' })
})

// A submit navigates to the run it created; the tutorial redirects that to its
// own run stage, and any other departure simply ends the session.
onBeforeRouteLeave((to) => {
  if (tutorialStatus.value === 'idle') return true
  if (to.name === 'task' || to.name === 'job' || to.name === 'run') return TUTORIAL_RUN_ROUTE
  exitTutorial()
  return true
})

function closeRun() {
  exitTutorial()
}

onUnmounted(exitTutorial)
</script>

<template>
  <div>
    <div class="container pt-6">
      <Notice tone="info" data-tutorial="run-progress">
        <span class="font-medium">Tutorial:</span>
        this is a practice run against made-up data. Nothing is created, and no request leaves your browser.
        <span v-if="showRun"> The simulated run is <span class="font-medium">{{ stageLabel }}</span>.</span>
      </Notice>
    </div>

    <TaskDetailPanel v-if="showRun" :task-id="TUTORIAL_TASK_ID" open @update:open="closeRun" />
    <ComputeSubmitView v-else />
  </div>
</template>
