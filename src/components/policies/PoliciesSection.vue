<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import PolicyRow from '@/components/policies/PolicyRow.vue'
import PolicyDryRun from '@/components/policies/PolicyDryRun.vue'
import { computed, ref, watch } from 'vue'
import { Plus, RefreshCw, Save, ShieldAlert } from '@lucide/vue'
import { ApiError, apiErrorMessage } from '@/lib/api'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { isPoliciesUnsupported, isStaleWrite, usePolicies } from '@/composables/usePolicies'
import {
  MAX_POLICIES_PER_SCOPE,
  POLICY_VARIABLES,
  emptyPolicy,
  policyProblems,
  type Policy,
} from '@/lib/policies'

const props = defineProps<{ scope: 'realm' | 'group'; groupId?: string; canAdmin: boolean }>()

const { getRealmPolicies, getGroupPolicies, setRealmPolicies, setGroupPolicies, saving } =
  usePolicies()
const { writesDisabled } = useConnectivity()

const stored = ref<Policy[]>([])
const draft = ref<Policy[]>([])
const setHash = ref('')
const loading = ref(false)
const loadError = ref<string | null>(null)
const saveError = ref<string | null>(null)
const staleWrite = ref(false)
const hidden = ref(false)
const unsupported = ref(false)
const showVariables = ref(false)
// Rows added in this session open expanded; loaded ones start collapsed.
const openIds = ref<string[]>([])

const dirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(stored.value))
const incomplete = computed(() => draft.value.some((policy) => policyProblems(policy).length > 0))
const atCap = computed(() => draft.value.length >= MAX_POLICIES_PER_SCOPE)
const canSave = computed(
  () => props.canAdmin && dirty.value && !incomplete.value && !saving.value && !writesDisabled.value,
)

// Rows are reordered and removed by index, so a stable key must not be the
// index; drafts without a server id get a local one that never reaches the API.
const localIds = new WeakMap<Policy, string>()
let nextLocalId = 0
function rowKey(policy: Policy): string {
  if (policy.policy_id) return policy.policy_id
  let id = localIds.get(policy)
  if (!id) {
    id = `draft-${nextLocalId++}`
    localIds.set(policy, id)
  }
  return id
}

let loadSeq = 0
async function load() {
  const seq = ++loadSeq
  loading.value = true
  loadError.value = null
  saveError.value = null
  staleWrite.value = false
  hidden.value = false
  unsupported.value = false
  try {
    const response =
      props.scope === 'group' && props.groupId
        ? await getGroupPolicies(props.groupId)
        : await getRealmPolicies()
    if (seq !== loadSeq) return
    stored.value = response.policies
    draft.value = response.policies.map((policy) => ({ ...policy }))
    setHash.value = response.set_hash
    openIds.value = []
  } catch (err) {
    if (seq !== loadSeq) return
    if (isPoliciesUnsupported(err)) unsupported.value = true
    else if (err instanceof ApiError && (err.status === 401 || err.status === 403)) hidden.value = true
    else loadError.value = apiErrorMessage(err)
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

watch(() => [props.scope, props.groupId], () => void load(), { immediate: true })

function addPolicy() {
  const policy = emptyPolicy()
  draft.value = [...draft.value, policy]
  openIds.value = [...openIds.value, rowKey(policy)]
}

function updatePolicy(index: number, policy: Policy) {
  const next = [...draft.value]
  const previous = next[index]
  const id = localIds.get(previous)
  if (id) localIds.set(policy, id)
  next[index] = policy
  draft.value = next
}

function removePolicy(index: number) {
  draft.value = draft.value.filter((_, i) => i !== index)
}

function revert() {
  draft.value = stored.value.map((policy) => ({ ...policy }))
  saveError.value = null
  staleWrite.value = false
}

async function save() {
  saveError.value = null
  staleWrite.value = false
  try {
    const response =
      props.scope === 'group' && props.groupId
        ? await setGroupPolicies(props.groupId, draft.value, setHash.value)
        : await setRealmPolicies(draft.value, setHash.value)
    stored.value = response.policies
    draft.value = response.policies.map((policy) => ({ ...policy }))
    setHash.value = response.set_hash
  } catch (err) {
    // A 409 means the stored set moved under us; the draft is kept so the
    // author can re-apply it after reloading rather than losing the edit.
    if (isStaleWrite(err)) staleWrite.value = true
    else saveError.value = apiErrorMessage(err)
  }
}

const scopeNoun = computed(() => (props.scope === 'group' ? 'group' : 'realm'))
</script>

<template>
  <section v-if="!hidden" class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="text-sm font-semibold text-foreground">Request policies</h3>
        <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
          CEL rules that narrow what an already-authorized caller may do in this {{ scopeNoun }}.
          Policies only ever deny; they never grant access. An expression that fails to evaluate
          denies the request.
        </p>
      </div>
      <div class="flex shrink-0 gap-2">
        <Button variant="ghost" size="sm" :disabled="loading" @click="load">
          <RefreshCw class="h-3.5 w-3.5" :class="loading ? 'animate-spin' : ''" /> Reload
        </Button>
        <Button v-if="canAdmin" variant="outline" size="sm" :disabled="atCap" @click="addPolicy">
          <Plus class="h-3.5 w-3.5" /> Add policy
        </Button>
      </div>
    </div>

    <p v-if="atCap" class="text-xs text-amber-700 dark:text-amber-300">
      This scope holds the maximum of {{ MAX_POLICIES_PER_SCOPE }} policies.
    </p>

    <div v-if="unsupported" class="surface-muted px-4 py-6 text-center text-sm text-muted-foreground">
      This node does not serve the policy API yet.
    </div>

    <template v-else>
      <div v-if="loading && !draft.length" class="space-y-2">
        <Skeleton v-for="n in 3" :key="n" class="h-14 w-full" />
      </div>

      <ErrorPanel v-else-if="loadError" :message="loadError" @retry="load" />

      <EmptyState
        v-else-if="!draft.length"
        title="No policies"
        :description="`Every authorized request in this ${scopeNoun} is allowed through. Add a policy to narrow that.`"
      >
        <template #icon><ShieldAlert class="h-5 w-5" /></template>
        <Button v-if="canAdmin" variant="outline" size="sm" @click="addPolicy">
          <Plus class="h-3.5 w-3.5" /> Add the first policy
        </Button>
      </EmptyState>

      <div v-else class="space-y-2">
        <PolicyRow
          v-for="(policy, index) in draft"
          :key="rowKey(policy)"
          :policy="policy"
          :can-admin="canAdmin"
          :start-open="openIds.includes(rowKey(policy))"
          @update="updatePolicy(index, $event)"
          @remove="removePolicy(index)"
        />
      </div>

      <div v-if="staleWrite" class="surface border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm">
        <p class="font-medium text-amber-800 dark:text-amber-200">Someone else changed this policy set.</p>
        <p class="mt-1 text-muted-foreground">
          Your edits are still here. Reload to pull their version, then re-apply what you need.
        </p>
        <Button variant="outline" size="sm" class="mt-2" @click="load">Reload</Button>
      </div>

      <p v-if="saveError" class="text-sm text-destructive">{{ saveError }}</p>
      <p v-else-if="canAdmin && writesDisabled" class="text-sm text-muted-foreground">
        {{ OFFLINE_WRITE_HINT }}
      </p>
      <p v-else-if="incomplete" class="text-sm text-muted-foreground">
        Finish the incomplete policies before saving.
      </p>

      <div v-if="canAdmin" class="flex flex-wrap items-center gap-2">
        <Button :disabled="!canSave" @click="save">
          <Save class="h-4 w-4" /> {{ saving ? 'Saving…' : 'Save policies' }}
        </Button>
        <Button v-if="dirty" variant="ghost" size="sm" @click="revert">Discard changes</Button>
        <button
          type="button"
          class="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          @click="showVariables = !showVariables"
        >
          {{ showVariables ? 'Hide' : 'Show' }} available variables
        </button>
      </div>

      <dl v-if="showVariables" class="surface-muted grid gap-x-4 gap-y-1.5 p-3 text-xs sm:grid-cols-2">
        <div v-for="variable in POLICY_VARIABLES" :key="variable.name" class="flex gap-2">
          <dt class="font-mono font-medium text-foreground">{{ variable.name }}</dt>
          <dd class="text-muted-foreground">{{ variable.description }}</dd>
        </div>
      </dl>

      <PolicyDryRun
        :scope="scope"
        :group-id="groupId"
        :draft="draft"
        :dirty="dirty"
        class="pt-2"
      />
    </template>
  </section>
</template>
