<script setup lang="ts">
// Import a dataset from another realm: say where it goes here, then choose it in a window
// of the source realm. Progress comes from the import job on the node that runs it.
import { computed, onBeforeUnmount, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import RealmPicker from '@/components/federation/RealmPicker.vue'
import RealmTag from '@/components/federation/RealmTag.vue'
import TransferJobStatus from '@/components/metadata/TransferJobStatus.vue'
import TransferReport from '@/components/metadata/TransferReport.vue'
import TransferTarget from '@/components/metadata/TransferTarget.vue'
import { useAruna } from '@/composables/useAruna'
import { useJobDetail } from '@/composables/useJobs'
import { useRealmImport } from '@/composables/useRealmImport'
import type { VerifiedRealm } from '@/lib/federation/descriptor'
import { isTerminalJobState } from '@/lib/jobs'
import { importJobResult } from '@/lib/rocrateArchive'
import { ExternalLink, RefreshCw } from '@lucide/vue'

const props = defineProps<{ active: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const { groups, realm, apiBaseUrl } = useAruna()
const flow = useRealmImport()
const { phase, failure, submitted, jobClient, files, canRetry } = flow

const home = ref<VerifiedRealm | null>(null)
const choosingRealm = ref(true)
const groupId = ref('')
const bucket = ref('')
const prefix = ref('')
const documentPath = ref('')

const jobId = computed(() => submitted.value?.job_id ?? null)
const detail = useJobDetail(() => jobId.value, { client: () => jobClient.value ?? { baseUrl: apiBaseUrl.value } })
const { job, loadState, loadError, lastPollError, load, cancel, cancelling } = detail
const terminal = computed(() => Boolean(job.value && isTerminalJobState(job.value.state)))
const createdDocumentId = computed(() => importJobResult(job.value?.result)?.document_id ?? null)
// The report is read from this node; a pushed import may run on another node of this realm.
const reportHere = computed(() => !jobClient.value || jobClient.value.baseUrl === apiBaseUrl.value)

const ready = computed(() =>
  Boolean(home.value && groupId.value && bucket.value.trim() && documentPath.value.trim()),
)
const busy = computed(() => phase.value === 'preparing' || phase.value === 'choosing' || phase.value === 'copying')
const phaseLabel = computed(() => {
  if (phase.value === 'preparing') return 'Getting ready…'
  if (phase.value === 'choosing') return `Choose the dataset in the ${home.value?.name} window.`
  return 'Waiting for the other realm…'
})

function chooseRealm(picked: VerifiedRealm) {
  home.value = picked
  choosingRealm.value = false
}

function start() {
  if (!home.value || !ready.value) return
  void flow.start({
    home: home.value,
    groupId: groupId.value,
    groupName: groups.value.find((group) => group.id === groupId.value)?.name ?? 'this group',
    bucket: bucket.value.trim(),
    prefix: prefix.value.trim(),
    metadataPath: documentPath.value.trim(),
  })
}

onBeforeUnmount(() => flow.reset())
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4">
    <div class="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
      <template v-if="phase !== 'started'">
        <p class="text-xs text-muted-foreground">Bring a dataset here from a realm you can log in to.</p>
        <div>
          <p class="text-xs font-medium text-foreground">Source realm</p>
          <div v-if="home && !choosingRealm" class="mt-1 flex items-center gap-2">
            <RealmTag :realm-id="home.realmId" :name="home.name" />
            <Button size="sm" variant="ghost" :disabled="busy" @click="choosingRealm = true">Change</Button>
          </div>
          <div v-else class="mt-1 rounded-lg border border-border bg-muted/30 p-1">
            <RealmPicker action-label="Choose" :exclude-realm-id="realm.id" @pick="chooseRealm" />
          </div>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <TransferTarget
            v-model:group-id="groupId"
            v-model:bucket="bucket"
            v-model:prefix="prefix"
            :active="props.active"
            @navigate="emit('close')"
          >
            <div>
              <label class="text-xs font-medium text-foreground" for="realm-import-path">Dataset path</label>
              <Input id="realm-import-path" v-model="documentPath" placeholder="datasets/my-dataset" class="mt-1" />
            </div>
          </TransferTarget>
        </div>
        <Spinner v-if="busy" show-label :label="phaseLabel" class="text-xs" />
        <Notice v-if="failure" tone="error">{{ failure }}</Notice>
      </template>

      <section v-else class="space-y-3">
        <TransferJobStatus :job="job" :load-state="loadState" :load-error="loadError" :last-poll-error="lastPollError" @retry="load" />
        <p v-if="terminal && files === 0" class="text-xs text-muted-foreground">Files stay at {{ home?.name }}.</p>
        <Button v-if="createdDocumentId" variant="outline" size="sm" as-child @click="emit('close')">
          <RouterLink :to="{ name: 'dataset', params: { id: createdDocumentId } }">Open dataset</RouterLink>
        </Button>
        <TransferReport v-if="jobId && reportHere" :key="jobId" :job-id="jobId" :settled="terminal" />
      </section>
    </div>

    <DialogFooter>
      <Button variant="outline" @click="emit('close')">Close</Button>
      <template v-if="phase === 'failed' && canRetry">
        <Button variant="outline" @click="start">Import metadata only</Button>
        <Button variant="outline" @click="flow.retry()"><RefreshCw class="h-4 w-4" /> Retry file copy</Button>
      </template>
      <Button v-else-if="phase === 'started' && !terminal" variant="outline" :disabled="cancelling" @click="cancel()">Cancel import</Button>
      <Button v-else-if="phase === 'started'" variant="outline" @click="flow.reset()">Import another</Button>
      <Button v-if="phase !== 'started'" :disabled="!ready || busy" @click="start">
        <Spinner v-if="busy" class="text-current" aria-hidden="true" />
        <ExternalLink v-else class="h-4 w-4" />
        Choose dataset at {{ home?.name ?? 'the realm' }}
      </Button>
    </DialogFooter>
  </div>
</template>
