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
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import CopyButton from '@/components/nodes/CopyButton.vue'
import ExternalLink from '@/components/ui/ExternalLink.vue'
import { useAruna } from '@/composables/useAruna'
import { useRefresh } from '@/composables/useRefresh'
import { ApiError } from '@/lib/api'
import { graphIriFor } from '@/lib/graphIri'
import { listPersistentIds, pidStateMeta, withdrawPid, type PersistentIdView } from '@/lib/pid'
import { Fingerprint, RefreshCw } from '@lucide/vue'

const REASON_MAX = 1024

const props = defineProps<{
  documentId: string
  isPublic: boolean
}>()

const { apiBaseUrl, authToken, currentUser, canWithdrawPids } = useAruna()

function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

const view = ref<PersistentIdView | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
// A private document has no anonymous status: the route answers 404 rather
// than acting as an existence oracle.
const needsSignIn = ref(false)
const showWithdraw = ref(false)
const withdrawing = ref(false)
const withdrawError = ref<string | null>(null)
const confirmValue = ref('')
const reason = ref('')

let loadToken = 0
async function load() {
  const token = ++loadToken
  loading.value = true
  loadError.value = null
  needsSignIn.value = false
  try {
    const rows = await listPersistentIds(props.documentId, client())
    if (token !== loadToken) return
    view.value = rows[0] ?? null
  } catch (err) {
    if (token !== loadToken) return
    view.value = null
    if (err instanceof ApiError && err.status === 404 && !currentUser.value) needsSignIn.value = true
    else loadError.value = errorMessage(err)
  } finally {
    if (token === loadToken) loading.value = false
  }
}

watch(
  () => props.documentId,
  () => {
    view.value = null
    withdrawError.value = null
    showWithdraw.value = false
    void load()
  },
  { immediate: true },
)

const { busy: refreshBusy, refresh: onRefresh } = useRefresh(load)
const spinning = computed(() => refreshBusy.value || loading.value)

const pid = computed(() => view.value?.value ?? graphIriFor(props.documentId))
const state = computed(() => view.value?.state ?? 'unknown')
const meta = computed(() => pidStateMeta(state.value))

const canWithdraw = computed(
  () =>
    canWithdrawPids.value &&
    view.value !== null &&
    ['requested', 'processing', 'active', 'failed'].includes(state.value),
)

const trimmedReason = computed(() => reason.value.trim())
const withdrawValid = computed(
  () =>
    Boolean(view.value?.value) &&
    confirmValue.value.trim() === view.value?.value?.trim() &&
    trimmedReason.value.length > 0 &&
    trimmedReason.value.length <= REASON_MAX,
)

function openWithdraw() {
  withdrawError.value = null
  confirmValue.value = ''
  reason.value = ''
  showWithdraw.value = true
}

async function confirmWithdraw() {
  const stored = view.value?.value
  if (withdrawing.value || !withdrawValid.value || !stored) return
  withdrawError.value = null
  withdrawing.value = true
  try {
    await withdrawPid(props.documentId, stored, trimmedReason.value, client())
    showWithdraw.value = false
    confirmValue.value = ''
    reason.value = ''
    await load()
  } catch (err) {
    withdrawError.value = errorMessage(err)
  } finally {
    withdrawing.value = false
  }
}
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
        :disabled="spinning"
        :aria-busy="spinning"
        aria-label="Re-check PID status"
        @click="onRefresh"
      >
        <RefreshCw class="h-3.5 w-3.5" :class="spinning ? 'animate-spin' : ''" />
      </Button>
    </header>

    <div class="space-y-3 p-5">
      <div class="flex flex-wrap items-center gap-2">
        <code class="min-w-0 break-all font-mono text-xs text-foreground">{{ pid }}</code>
        <CopyButton :value="pid" label="Copy PID" />
        <Skeleton v-if="loading" class="h-5 w-24" />
        <Badge v-else :variant="meta.variant">{{ meta.label }}</Badge>
      </div>

      <template v-if="!loading">
        <p v-if="needsSignIn" class="text-xs text-muted-foreground">
          Sign in to see the identifier status for this document.
        </p>
        <p v-else-if="loadError" class="text-xs text-muted-foreground">
          The identifier status could not be read ({{ loadError }}). Try again later.
        </p>
        <template v-else-if="view">
          <p v-if="state === 'requested' || state === 'processing'" class="text-xs text-muted-foreground">
            Registration runs automatically as a background job on the PID authority; the identifier is
            not live until it finishes.
            <code v-if="view.job_id" class="ml-1 font-mono text-[11px]">{{ view.job_id }}</code>
          </p>
          <p v-else-if="state === 'active' && isPublic" class="text-xs text-muted-foreground">
            The identifier redirects anonymous visitors to this document's RO-Crate.
            <ExternalLink :href="pid" label="Open landing page" class="text-xs" />
          </p>
          <p v-else-if="state === 'active'" class="text-xs text-muted-foreground">
            The PID is registered, but the landing page only resolves documents that are anonymously
            visible; it answers 404 until this document is made public.
          </p>
          <p v-else-if="state === 'failed'" class="text-xs text-muted-foreground">
            {{ view.failure?.message ?? 'Registration failed on the PID authority.' }}
            {{ view.failure?.retryable ? 'The authority retries it automatically.' : 'It needs administrator attention.' }}
          </p>
          <p v-else-if="state === 'admin-withdrawn'" class="text-xs text-muted-foreground">
            This identifier was withdrawn by a realm administrator: the landing page answers 410 Gone
            permanently and it cannot be reactivated.
          </p>
          <p v-else-if="state === 'tombstoned'" class="text-xs text-muted-foreground">
            The document was deleted; the identifier keeps a resolvable tombstone.
          </p>
          <p v-else class="text-xs text-muted-foreground">
            The PID authority cannot currently give a definitive record. Try again later.
          </p>
        </template>
      </template>

      <div v-if="canWithdraw" class="pt-1">
        <Button
          size="sm"
          variant="outline"
          class="text-destructive hover:text-destructive"
          title="Realm administrators only"
          @click="openWithdraw"
        >
          Withdraw PID (admin)
        </Button>
      </div>
    </div>

    <Dialog :open="showWithdraw" @update:open="(v: boolean) => (showWithdraw = v)">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Withdraw persistent identifier</DialogTitle>
          <DialogDescription>
            Withdrawing is permanent and irreversible: <span class="font-mono text-xs">{{ pid }}</span>
            will answer 410 Gone forever and can never be reactivated. This is an administrative action;
            normal deletion of the document keeps a tombstone instead.
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-3">
          <div class="space-y-1">
            <label for="pid-withdraw-confirm" class="text-xs font-medium text-foreground">Type the identifier to confirm</label>
            <Input id="pid-withdraw-confirm" v-model="confirmValue" class="font-mono text-xs" :placeholder="view?.value ?? ''" />
          </div>
          <div class="space-y-1">
            <label for="pid-withdraw-reason" class="text-xs font-medium text-foreground">Reason</label>
            <Textarea id="pid-withdraw-reason" v-model="reason" rows="3" :maxlength="REASON_MAX" />
            <p class="text-[11px] text-muted-foreground">
              Required, {{ REASON_MAX - trimmedReason.length }} characters left.
            </p>
          </div>
        </div>
        <p v-if="withdrawError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{{ withdrawError }}</p>
        <DialogFooter>
          <DialogClose as-child><Button variant="outline">Cancel</Button></DialogClose>
          <Button variant="destructive" :disabled="withdrawing || !withdrawValid" @click="confirmWithdraw">
            {{ withdrawing ? 'Withdrawing…' : 'Withdraw permanently' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>
