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
import Notice from '@/components/ui/Notice.vue'
import Textarea from '@/components/ui/Textarea.vue'
import { useAruna } from '@/composables/useAruna'
import { listPersistentIds, pidStateMeta, withdrawPid, type PersistentIdView } from '@/lib/pid'
import { errorMessage } from '@/lib/utils'

// Withdrawal is an exceptional realm-administrator action on the dataset being
// edited, so it lives with the other edit-time settings, never on the reading
// surface. The status card on the dataset page stays read-only.
const REASON_MAX = 1024
const WITHDRAWABLE = ['requested', 'processing', 'active', 'failed']

const props = defineProps<{ documentId: string }>()

const { apiBaseUrl, authToken, canWithdrawPids } = useAruna()

function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

const view = ref<PersistentIdView | null>(null)
const open = ref(false)
const withdrawing = ref(false)
const withdrawError = ref<string | null>(null)
const confirmValue = ref('')
const reason = ref('')

let loadToken = 0
async function load() {
  const token = ++loadToken
  if (!props.documentId || !canWithdrawPids.value) {
    view.value = null
    return
  }
  try {
    const rows = await listPersistentIds(props.documentId, client())
    if (token === loadToken) view.value = rows[0] ?? null
  } catch {
    // A status that cannot be read hides the action; the dataset page reports it.
    if (token === loadToken) view.value = null
  }
}

watch(
  [() => props.documentId, canWithdrawPids],
  () => {
    view.value = null
    withdrawError.value = null
    open.value = false
    void load()
  },
  { immediate: true },
)

const state = computed(() => view.value?.state ?? 'unknown')
const meta = computed(() => pidStateMeta(state.value))
const canWithdraw = computed(
  () => canWithdrawPids.value && view.value !== null && WITHDRAWABLE.includes(state.value),
)

const trimmedReason = computed(() => reason.value.trim())
const valid = computed(
  () =>
    Boolean(view.value?.value) &&
    confirmValue.value.trim() === view.value?.value?.trim() &&
    trimmedReason.value.length > 0 &&
    trimmedReason.value.length <= REASON_MAX,
)

function start() {
  withdrawError.value = null
  confirmValue.value = ''
  reason.value = ''
  open.value = true
}

async function confirm() {
  const stored = view.value?.value
  if (withdrawing.value || !valid.value || !stored) return
  withdrawError.value = null
  withdrawing.value = true
  try {
    await withdrawPid(props.documentId, stored, trimmedReason.value, client())
    open.value = false
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
  <section v-if="canWithdraw" class="surface overflow-hidden">
    <header class="border-b border-border px-5 py-3.5 text-sm font-medium text-foreground">
      Administration
    </header>

    <div class="flex flex-wrap items-center gap-2 p-5">
      <span class="text-xs text-muted-foreground">Persistent identifier</span>
      <code class="min-w-0 break-all font-mono text-xs text-foreground">{{ view?.value }}</code>
      <Badge :variant="meta.variant">{{ meta.label }}</Badge>
      <Button
        size="sm"
        variant="outline"
        class="ml-auto text-destructive hover:text-destructive"
        title="Realm administrators only"
        @click="start"
      >
        Withdraw PID
      </Button>
    </div>

    <Dialog :open="open" @update:open="(v: boolean) => (open = v)">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Withdraw persistent identifier</DialogTitle>
          <DialogDescription>
            Withdrawing is permanent and irreversible:
            <span class="font-mono text-xs">{{ view?.value }}</span>
            will answer 410 Gone forever and can never be reactivated. This is an administrative action;
            normal deletion of the dataset keeps a tombstone instead.
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
        <Notice v-if="withdrawError" tone="error">{{ withdrawError }}</Notice>
        <DialogFooter>
          <DialogClose as-child><Button variant="outline">Cancel</Button></DialogClose>
          <Button variant="destructive" :disabled="withdrawing || !valid" @click="confirm">
            {{ withdrawing ? 'Withdrawing…' : 'Withdraw permanently' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>
