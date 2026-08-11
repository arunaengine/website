<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import CopyButton from '@/components/nodes/CopyButton.vue'
import ExternalLink from '@/components/ui/ExternalLink.vue'
import { useAruna } from '@/composables/useAruna'
import { useJobDetail, useJobs } from '@/composables/useJobs'
import { graphIriFor } from '@/lib/graphIri'
import { mintPid, probePid, withdrawPid, type PidResolution } from '@/lib/pid'
import { JOB_STATE_META, isTerminalJobState } from '@/lib/jobs'
import { Fingerprint, RefreshCw } from '@lucide/vue'

const props = defineProps<{
  documentId: string
  isPublic: boolean
  canWrite: boolean
}>()

const { apiBaseUrl, authToken, currentUser } = useAruna()
const { jobsEnabled } = useJobs()

function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

const pid = computed(() => graphIriFor(props.documentId))

const resolution = ref<'probing' | PidResolution>('probing')
// Set once a mint job reports success: the registry mapping exists even when
// the anonymous landing cannot confirm it (private document resolves 404).
const minted = ref(false)
const mintJobId = ref<string | null>(null)
const minting = ref(false)
const mintError = ref<string | null>(null)
const showWithdraw = ref(false)
const withdrawing = ref(false)
const withdrawError = ref<string | null>(null)

let probeToken = 0
async function probe() {
  const token = ++probeToken
  resolution.value = 'probing'
  const answer = await probePid(props.documentId, apiBaseUrl.value)
  if (token === probeToken) resolution.value = answer
}

watch(
  () => props.documentId,
  () => {
    minted.value = false
    mintJobId.value = null
    mintError.value = null
    withdrawError.value = null
    void probe()
  },
  { immediate: true },
)

// Registration is a background job: the 202 only means the authority queued
// it, so the section stays pending until the polled job lands.
const {
  job: mintJob,
  loadState: mintJobState,
  loadError: mintJobError,
  lastPollError,
} = useJobDetail(() => (jobsEnabled.value ? mintJobId.value : null))
const mintPending = computed(() => {
  if (!mintJobId.value || !jobsEnabled.value) return false
  if (!mintJob.value) return mintJobState.value !== 'error'
  return !isTerminalJobState(mintJob.value.state)
})
watch(mintJob, (job) => {
  if (!job || !isTerminalJobState(job.state)) return
  if (job.state === 'succeeded') {
    minted.value = true
    void probe()
  } else {
    mintError.value = job.error?.message ?? `Mint job ${JOB_STATE_META[job.state].label.toLowerCase()}.`
    // A terminal non-success leaves nothing in flight; mint is idempotent, so
    // offer the retry.
    mintJobId.value = null
  }
})

async function mint() {
  if (minting.value) return
  mintError.value = null
  minting.value = true
  try {
    const accepted = await mintPid(props.documentId, client())
    mintJobId.value = accepted.job_id
    // Without the jobs surface the acceptance is all we can report; a manual
    // re-check is the only way to observe the landing flip.
    if (!jobsEnabled.value) void probe()
  } catch (err) {
    mintError.value = errorMessage(err)
  } finally {
    minting.value = false
  }
}

async function confirmWithdraw() {
  if (withdrawing.value) return
  withdrawError.value = null
  withdrawing.value = true
  try {
    await withdrawPid(props.documentId, client())
    // 204 means the tombstone is durable on the authority.
    showWithdraw.value = false
    minted.value = false
    mintJobId.value = null
    resolution.value = 'withdrawn'
  } catch (err) {
    withdrawError.value = errorMessage(err)
  } finally {
    withdrawing.value = false
  }
}

const registered = computed(() => resolution.value === 'active' || minted.value)
const canMint = computed(
  () =>
    props.canWrite &&
    Boolean(currentUser.value) &&
    resolution.value === 'missing' &&
    !minted.value &&
    !mintPending.value &&
    !mintJobId.value,
)
const canWithdraw = computed(
  () => props.canWrite && Boolean(currentUser.value) && registered.value && resolution.value !== 'withdrawn',
)
</script>

<template>
  <section class="surface overflow-hidden">
    <header class="flex items-center justify-between gap-2 border-b border-border px-5 py-3.5">
      <div class="flex items-center gap-2 text-sm font-medium text-foreground">
        <Fingerprint class="h-4 w-4 text-primary" /> Persistent identifier
      </div>
      <Button
        variant="ghost"
        size="icon"
        :disabled="resolution === 'probing'"
        aria-label="Re-check PID resolution"
        @click="probe"
      >
        <RefreshCw class="h-3.5 w-3.5" />
      </Button>
    </header>

    <div class="space-y-3 p-5">
      <div class="flex flex-wrap items-center gap-2">
        <code class="min-w-0 break-all font-mono text-xs text-foreground">{{ pid }}</code>
        <CopyButton :value="pid" label="Copy PID" />
        <Skeleton v-if="resolution === 'probing'" class="h-5 w-24" />
        <Badge v-else-if="resolution === 'active'" variant="success">Resolves publicly</Badge>
        <Badge v-else-if="resolution === 'withdrawn'" variant="destructive">Withdrawn — permanent</Badge>
        <Badge v-else-if="minted" variant="secondary">Registered</Badge>
        <Badge v-else-if="resolution === 'unavailable'" variant="warn">Authority unreachable</Badge>
        <Badge v-else variant="outline">Not minted</Badge>
      </div>

      <p v-if="resolution === 'withdrawn'" class="text-xs text-muted-foreground">
        This PID has been withdrawn: the landing page answers 410 Gone permanently, and it cannot be
        re-minted or reactivated.
      </p>
      <p v-else-if="resolution === 'active'" class="text-xs text-muted-foreground">
        The identifier redirects anonymous visitors to this document's RO-Crate.
        <ExternalLink :href="pid" label="Open landing page" class="text-xs" />
      </p>
      <p v-else-if="minted && !isPublic" class="text-xs text-muted-foreground">
        The PID is registered, but the landing page only resolves documents that are anonymously
        visible — it answers 404 until this document is made public.
      </p>
      <p v-else-if="resolution === 'missing' && !isPublic && !mintJobId" class="text-xs text-muted-foreground">
        No publicly resolvable PID. The anonymous landing check cannot tell an unminted PID from one
        minted for this private document, so a mint here is safe: it is idempotent per document.
      </p>
      <p v-else-if="resolution === 'missing' && !mintJobId" class="text-xs text-muted-foreground">
        No PID minted. Minting registers {{ pid }} as a permanent, citable identifier for this document.
      </p>
      <p v-else-if="resolution === 'unavailable'" class="text-xs text-muted-foreground">
        The PID authority for this document cannot be reached right now, so its registration state is
        unknown. Try again later.
      </p>

      <div v-if="mintPending" class="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
        <Badge :variant="mintJob ? JOB_STATE_META[mintJob.state].variant : 'secondary'">
          {{ mintJob ? JOB_STATE_META[mintJob.state].label : 'Accepted' }}
        </Badge>
        <span class="text-muted-foreground">
          Mint accepted — registration runs as a background job and the PID is not live until it
          finishes.
        </span>
        <span v-if="lastPollError" class="text-amber-700 dark:text-amber-300">Status check failed, retrying.</span>
      </div>
      <p v-else-if="mintJobId && !jobsEnabled" class="text-xs text-muted-foreground">
        Mint accepted — registration runs as a background job; re-check to see it land.
      </p>
      <p v-else-if="mintJobId && mintJobState === 'error'" class="text-xs text-amber-700 dark:text-amber-300">
        Mint accepted, but its job status could not be read{{ mintJobError ? ` (${mintJobError})` : '' }} —
        re-check the resolution later.
      </p>

      <p v-if="mintError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{{ mintError }}</p>

      <div v-if="canMint || canWithdraw" class="flex items-center gap-2 pt-1">
        <Button v-if="canMint" size="sm" :disabled="minting" @click="mint">
          {{ minting ? 'Minting…' : 'Mint PID' }}
        </Button>
        <Button
          v-if="canWithdraw"
          size="sm"
          variant="outline"
          class="text-destructive hover:text-destructive"
          @click="withdrawError = null; showWithdraw = true"
        >
          Withdraw PID
        </Button>
      </div>
    </div>

    <Dialog :open="showWithdraw" @update:open="(v: boolean) => (showWithdraw = v)">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Withdraw persistent identifier</DialogTitle>
          <DialogDescription>
            Withdrawing is permanent and irreversible: <span class="font-mono text-xs">{{ pid }}</span>
            will answer 410 Gone forever, and it can never be re-minted or reactivated — even while the
            document itself stays available.
          </DialogDescription>
        </DialogHeader>
        <p v-if="withdrawError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{{ withdrawError }}</p>
        <DialogFooter>
          <DialogClose as-child><Button variant="outline">Cancel</Button></DialogClose>
          <Button variant="destructive" :disabled="withdrawing" @click="confirmWithdraw">
            {{ withdrawing ? 'Withdrawing…' : 'Withdraw permanently' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>
