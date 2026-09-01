<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Notice from '@/components/ui/Notice.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Spinner from '@/components/ui/Spinner.vue'
import StatCard from '@/components/ui/StatCard.vue'
import CoverageReport from '@/components/placement/CoverageReport.vue'
import { usePlacementPolicies } from '@/composables/usePlacementPolicies'
import { useRefresh } from '@/composables/useRefresh'
import { ApiError } from '@/lib/api'
import {
  placementPoliciesErrorMessage,
  policyRefKey,
  policyRefProblems,
  runBulkToCompletion,
} from '@/lib/placementPolicies'
import type {
  BucketPlacementResponse,
  BulkRunProgress,
  CoverageResponse,
  CoverageScope,
  PolicyRefBody,
} from '@/lib/placementPolicies'
import { formatNumber, truncateMiddle } from '@/lib/utils'
import { Activity, Plus, Save, Trash2 } from '@lucide/vue'

const props = defineProps<{ open: boolean; bucket: string }>()

const {
  getBucketPlacement,
  getPlacementCoverage,
  putBucketPlacement,
  runBucketPlacement,
  listState,
  listedPolicies,
  loadPolicyPage,
  sessionPolicies,
  sessionPolicyRefs,
} = usePlacementPolicies()

const placement = ref<BucketPlacementResponse | null>(null)
const policies = ref<PolicyRefBody[]>([])
const loading = ref(false)
const hidden = ref(false)
const loadError = ref<string | null>(null)
const saving = ref(false)
const saveError = ref<string | null>(null)
const saveMessage = ref<string | null>(null)
const refErrors = computed(() => policyRefProblems(policies.value))
const dirty = computed(() => JSON.stringify(policies.value) !== JSON.stringify(placement.value?.policies ?? []))

const coverageScope = ref<CoverageScope>('current')
const coverage = ref<CoverageResponse | null>(null)
const coverageLoading = ref(false)
const coverageError = ref<string | null>(null)

const bulkBusy = ref(false)
const bulkProgress = ref<BulkRunProgress | null>(null)
const bulkError = ref<string | null>(null)
const staleBulkRun = Symbol('stale bulk run')
let bulkRunGeneration = 0

// Names come from the realm listing when the node serves one, and from the
// session library otherwise; an unresolved ref falls back to its id.
const policyNames = computed(() => {
  const names = new Map<string, string>()
  for (const policy of [...sessionPolicies.value, ...listedPolicies.value]) {
    names.set(policyRefKey(policy), policy.name)
  }
  return names
})

function policyLabel(policy: PolicyRefBody): string {
  return policyNames.value.get(policyRefKey(policy)) ?? truncateMiddle(policy.policy_id)
}

const attachable = computed(() => {
  const attached = new Set(policies.value.map(policyRefKey))
  const library = listState.value === 'ready' ? listedPolicies.value : sessionPolicies.value
  return library
    .filter((policy) => !attached.has(policyRefKey(policy)))
    .map((policy) => ({ value: policyRefKey(policy), label: policy.name }))
})
const attachChoice = ref('')
const attachHint = computed(() => {
  if (listState.value === 'loading') return 'Reading the realm policy list…'
  if (listState.value === 'ready') return 'No further realm policy is available to attach here.'
  return 'This node lists no realm policies. Reference one by id and digest under Advanced.'
})

const savedPolicies = computed(() => placement.value?.policies ?? [])
const covered = computed(() =>
  coverage.value ? Math.max(0, coverage.value.observed - coverage.value.gaps.length) : null,
)

let loadSequence = 0
async function load() {
  const sequence = ++loadSequence
  loading.value = true
  hidden.value = false
  loadError.value = null
  saveError.value = null
  saveMessage.value = null
  try {
    const stored = await getBucketPlacement(props.bucket)
    if (sequence !== loadSequence) return
    placement.value = stored
    policies.value = stored.policies.map((policy) => ({ ...policy }))
    void loadCoverage()
  } catch (error) {
    if (sequence !== loadSequence) return
    placement.value = null
    policies.value = []
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) hidden.value = true
    else loadError.value = placementPoliciesErrorMessage(error)
  } finally {
    if (sequence === loadSequence) loading.value = false
  }
}

const { busy: reloadBusy, refresh: onReload } = useRefresh(load)
const spinning = computed(() => reloadBusy.value || loading.value)

let coverageSequence = 0
async function loadCoverage(cursor?: string) {
  const sequence = ++coverageSequence
  coverageLoading.value = true
  coverageError.value = null
  try {
    const report = await getPlacementCoverage(props.bucket, {
      scope: coverageScope.value,
      cursor,
      limit: 128,
    })
    if (sequence === coverageSequence) coverage.value = report
  } catch (error) {
    if (sequence === coverageSequence) {
      coverage.value = null
      coverageError.value = placementPoliciesErrorMessage(error)
    }
  } finally {
    if (sequence === coverageSequence) coverageLoading.value = false
  }
}

function setCoverageScope(scope: CoverageScope) {
  if (coverageScope.value === scope) return
  coverageScope.value = scope
  void loadCoverage()
}

function attachSelected(key: string) {
  const library = listState.value === 'ready' ? listedPolicies.value : sessionPolicies.value
  const chosen = library.find((policy) => policyRefKey(policy) === key)
  attachChoice.value = ''
  if (!chosen) return
  policies.value.push({ policy_id: chosen.policy_id, digest: chosen.digest })
}

function addPolicyRef() {
  const selected = new Set(policies.value.map(policyRefKey))
  const known = sessionPolicyRefs.value.find((policy) => !selected.has(policyRefKey(policy)))
  policies.value.push(known ? { ...known } : { policy_id: '', digest: '' })
}

function removePolicyRef(index: number) {
  policies.value.splice(index, 1)
}

function resetPolicies() {
  policies.value = savedPolicies.value.map((policy) => ({ ...policy }))
}

async function saveDefaults() {
  if (!placement.value || refErrors.value.length || saving.value) return
  saving.value = true
  saveError.value = null
  saveMessage.value = null
  try {
    const stored = await putBucketPlacement(props.bucket, {
      policies: policies.value.map((policy) => ({
        policy_id: policy.policy_id.trim(),
        digest: policy.digest.trim(),
      })),
      expected_generation: placement.value.generation,
    })
    placement.value = stored
    policies.value = stored.policies.map((policy) => ({ ...policy }))
    saveMessage.value = stored.policies.length
      ? 'Bucket placement policies saved.'
      : 'Bucket placement policies cleared.'
    void loadCoverage()
  } catch (error) {
    saveError.value = placementPoliciesErrorMessage(error, 'bucket-cas')
  } finally {
    saving.value = false
  }
}

async function startBulkRun() {
  if (bulkBusy.value) return
  const bucket = props.bucket
  const generation = ++bulkRunGeneration
  const isCurrentRun = () => generation === bulkRunGeneration && props.open && props.bucket === bucket
  bulkBusy.value = true
  bulkError.value = null
  bulkProgress.value = null
  try {
    const progress = await runBulkToCompletion(
      (request) => {
        if (!isCurrentRun()) throw staleBulkRun
        return runBucketPlacement(bucket, request)
      },
      (progress) => {
        if (isCurrentRun()) bulkProgress.value = { ...progress }
      },
    )
    if (!isCurrentRun()) return
    bulkProgress.value = progress
    void loadCoverage()
  } catch (error) {
    if (error === staleBulkRun || !isCurrentRun()) return
    bulkError.value = placementPoliciesErrorMessage(error, 'bulk')
  } finally {
    if (generation === bulkRunGeneration) bulkBusy.value = false
  }
}

watch(
  () => [props.open, props.bucket],
  () => {
    bulkRunGeneration += 1
    bulkBusy.value = false
    if (!props.open) return
    bulkProgress.value = null
    bulkError.value = null
    attachChoice.value = ''
    coverageScope.value = 'current'
    coverage.value = null
    void load()
    if (listState.value === 'idle') void loadPolicyPage()
  },
  { immediate: true },
)
</script>

<template>
  <section class="space-y-4">
    <EmptyState v-if="hidden" compact title="Bucket placement needs realm configuration permission." />
    <div v-else-if="loading && !placement" class="space-y-3">
      <Skeleton class="h-20" />
      <Skeleton class="h-40" />
    </div>
    <ErrorPanel v-else-if="loadError" :message="loadError" @retry="load" />
    <template v-else-if="placement">
      <!-- Plain current state first; every editing control sits below it. -->
      <div class="space-y-2 rounded-lg border border-border bg-muted/20 p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm font-medium text-foreground">
            <template v-if="savedPolicies.length">
              Copies of this bucket follow
              {{ savedPolicies.length }} {{ savedPolicies.length === 1 ? 'policy' : 'policies' }}.
            </template>
            <template v-else>No placement policy is attached to this bucket.</template>
          </p>
          <RefreshButton :busy="spinning" :disabled="saving" sr-label="Reload placement" @click="onReload" />
        </div>
        <div v-if="savedPolicies.length" class="flex flex-wrap gap-1.5">
          <Badge v-for="policy in savedPolicies" :key="policyRefKey(policy)" variant="outline" :title="`${policy.policy_id}:${policy.digest}`">
            {{ policyLabel(policy) }}
          </Badge>
        </div>
        <p class="text-xs text-muted-foreground">
          <template v-if="coverageLoading && !coverage">Reading coverage…</template>
          <template v-else-if="covered !== null && coverage">
            {{ formatNumber(covered) }} of {{ formatNumber(coverage.observed) }} objects this node
            listed already follow them.
          </template>
          <template v-else-if="!savedPolicies.length">
            New objects are stored wherever the node and its group routing put them.
          </template>
          <template v-else>Coverage is not available for this bucket right now.</template>
        </p>
      </div>

      <div class="space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h4 class="text-sm font-semibold text-foreground">Attached policies</h4>
          <Badge variant="outline">generation {{ placement.generation }}</Badge>
        </div>

        <div v-if="policies.length" class="space-y-1.5">
          <div
            v-for="(policy, index) in policies"
            :key="index"
            class="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2"
          >
            <div class="min-w-0">
              <p class="truncate text-sm text-foreground">{{ policyLabel(policy) || 'Unnamed reference' }}</p>
              <p class="truncate font-mono text-[10px] text-muted-foreground" :title="`${policy.policy_id}:${policy.digest}`">
                {{ policy.policy_id || 'no id' }} / {{ policy.digest ? truncateMiddle(policy.digest, 8, 6) : 'no digest' }}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              class="text-destructive hover:text-destructive"
              :aria-label="`Remove placement policy ${index + 1}`"
              @click="removePolicyRef(index)"
            >
              <Trash2 class="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <p v-else class="text-xs text-muted-foreground">
          Nothing attached. Pick a realm policy below to declare where copies must live.
        </p>

        <div class="flex flex-wrap items-center gap-2">
          <Select
            v-if="attachable.length"
            :model-value="attachChoice"
            :options="attachable"
            class="max-w-xs"
            placeholder="Attach a policy…"
            aria-label="Attach a placement policy"
            @update:model-value="attachSelected"
          />
          <p v-else class="text-xs text-muted-foreground">{{ attachHint }}</p>
        </div>

        <ul v-if="refErrors.length" class="list-disc space-y-1 pl-5 text-xs text-destructive">
          <li v-for="error in refErrors" :key="error">{{ error }}</li>
        </ul>
        <p v-if="saveError" class="text-xs text-destructive">{{ saveError }}</p>
        <p v-else-if="saveMessage" class="text-xs text-emerald-700 dark:text-emerald-300">{{ saveMessage }}</p>

        <div class="flex flex-wrap gap-2">
          <Button :disabled="saving || !dirty || refErrors.length > 0" @click="saveDefaults">
            <Save class="h-3.5 w-3.5" /> {{ saving ? 'Saving…' : 'Save placement' }}
          </Button>
          <Button variant="outline" :disabled="saving || !dirty" @click="resetPolicies">Discard changes</Button>
        </div>
        <p class="text-[11px] text-muted-foreground">
          Saving replaces the whole set and governs versions written after it; existing objects keep
          their own refs until a catch-up run mints successors.
        </p>
      </div>

      <details class="rounded-md border border-border px-3 py-2">
        <summary class="cursor-pointer text-xs font-medium text-foreground">Coverage detail</summary>
        <div class="mt-3 space-y-3">
          <div class="flex items-center gap-1" role="group" aria-label="Coverage scope">
            <Button size="sm" :variant="coverageScope === 'current' ? 'default' : 'outline'" :aria-pressed="coverageScope === 'current'" @click="setCoverageScope('current')">Current</Button>
            <Button size="sm" :variant="coverageScope === 'historical' ? 'default' : 'outline'" :aria-pressed="coverageScope === 'historical'" @click="setCoverageScope('historical')">Historical</Button>
          </div>
          <div v-if="coverageLoading && !coverage" class="space-y-2"><Skeleton class="h-20" /><Skeleton class="h-32" /></div>
          <ErrorPanel v-else-if="coverageError" :message="coverageError" @retry="() => loadCoverage()" />
          <CoverageReport v-else-if="coverage" :report="coverage" />
          <div v-if="coverage?.cursor" class="flex justify-end">
            <Button variant="outline" size="sm" :disabled="coverageLoading" :aria-busy="coverageLoading" @click="loadCoverage(coverage.cursor)">
              <Spinner v-if="coverageLoading" label="Loading the next coverage page" class="text-current" /> Next responder page
            </Button>
          </div>
        </div>
      </details>

      <details class="rounded-md border border-border px-3 py-2">
        <summary class="cursor-pointer text-xs font-medium text-foreground">Advanced</summary>
        <div class="mt-3 space-y-5">
          <div class="space-y-2">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h5 class="text-xs font-semibold text-foreground">Reference a policy by id and digest</h5>
              <Button variant="outline" size="sm" @click="addPolicyRef"><Plus class="h-3.5 w-3.5" /> Add reference</Button>
            </div>
            <p class="text-[11px] text-muted-foreground">
              For a policy this node does not list; a reference is the id plus the digest of the definition.
            </p>
            <div
              v-for="(policy, index) in policies"
              :key="index"
              class="grid gap-2 rounded-md border border-border bg-background p-3 md:grid-cols-[minmax(12rem,0.8fr)_minmax(20rem,1.4fr)]"
            >
              <div>
                <label class="text-[11px] font-medium text-foreground">Placement policy id</label>
                <Input v-model="policy.policy_id" class="mt-1 font-mono text-xs" :aria-label="`Placement policy id ${index + 1}`" />
              </div>
              <div>
                <label class="text-[11px] font-medium text-foreground">Definition digest</label>
                <Input v-model="policy.digest" class="mt-1 font-mono text-xs" :aria-label="`Digest of placement policy ${index + 1}`" />
              </div>
            </div>
          </div>

          <div class="space-y-3 border-t border-border pt-4">
            <h5 class="text-xs font-semibold text-foreground">Catch-up run</h5>
            <p class="text-[11px] text-muted-foreground">
              Apply the attached policies to objects that existed before. One client-generated
              operation id is resumed page by page and exhausts only this responder's iterator.
            </p>
            <div v-if="bulkProgress" class="space-y-3">
              <div class="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <Badge :variant="bulkProgress.status === 'superseded' ? 'warn' : bulkProgress.complete ? 'success' : 'outline'">{{ bulkProgress.status }}</Badge>
                <span class="font-mono" :title="bulkProgress.operation_id">operation {{ truncateMiddle(bulkProgress.operation_id) }}</span>
                <span>generation {{ bulkProgress.generation }}</span>
              </div>
              <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <StatCard label="Observed" :value="formatNumber(bulkProgress.observed)" />
                <StatCard label="Covered" :value="formatNumber(bulkProgress.covered)" />
                <StatCard label="Minted" :value="formatNumber(bulkProgress.minted)" />
                <StatCard label="Replanned" :value="formatNumber(bulkProgress.replanned)" />
                <StatCard label="Blocked" :value="formatNumber(bulkProgress.blocked.length)" />
              </div>
              <Notice v-if="bulkProgress.message" tone="warning">
                {{ bulkProgress.message }}
              </Notice>
              <div v-if="bulkProgress.blocked.length" class="overflow-x-auto rounded-md border border-border">
                <table class="w-full min-w-[480px] text-left text-xs">
                  <thead class="border-b border-border bg-muted/40 text-muted-foreground"><tr><th class="px-3 py-2 font-medium">Blocked key</th><th class="px-3 py-2 font-medium">Reason</th></tr></thead>
                  <tbody class="divide-y divide-border">
                    <tr v-for="gap in bulkProgress.blocked" :key="`${gap.key}:${gap.reason}`"><td class="px-3 py-2 font-mono">{{ gap.key }}</td><td class="px-3 py-2">{{ gap.reason }}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
            <p v-if="bulkError" class="text-xs text-destructive">{{ bulkError }}</p>
            <Button
              variant="outline"
              :disabled="bulkBusy || dirty"
              :title="dirty ? 'Save or discard the attached set before applying it' : undefined"
              @click="startBulkRun"
            >
              <Activity class="h-3.5 w-3.5" /> {{ bulkBusy ? 'Applying…' : bulkProgress ? 'Start a new run' : 'Start run' }}
            </Button>
          </div>
        </div>
      </details>
    </template>
  </section>
</template>
