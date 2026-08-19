<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Input from '@/components/ui/Input.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import StatCard from '@/components/ui/StatCard.vue'
import CoverageReport from '@/components/residency/CoverageReport.vue'
import { usePlacementPolicies } from '@/composables/usePlacementPolicies'
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
import { Activity, MapPinned, Plus, RefreshCw, Save, Trash2 } from '@lucide/vue'

const props = defineProps<{ open: boolean; bucket: string }>()
const emit = defineEmits<{ (event: 'update:open', value: boolean): void }>()

const {
  getBucketPlacement,
  getPlacementCoverage,
  putBucketPlacement,
  runBucketPlacement,
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

const bulkOpen = ref(false)
const bulkBusy = ref(false)
const bulkProgress = ref<BulkRunProgress | null>(null)
const bulkError = ref<string | null>(null)
const staleBulkRun = Symbol('stale bulk run')
let bulkRunGeneration = 0

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

function addPolicyRef() {
  const selected = new Set(policies.value.map(policyRefKey))
  const known = sessionPolicyRefs.value.find((policy) => !selected.has(policyRefKey(policy)))
  policies.value.push(known ? { ...known } : { policy_id: '', digest: '' })
}

function removePolicyRef(index: number) {
  policies.value.splice(index, 1)
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
      ? 'Bucket residency defaults saved.'
      : 'Bucket residency defaults cleared.'
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
    bulkOpen.value = false
    bulkProgress.value = null
    bulkError.value = null
    coverageScope.value = 'current'
    coverage.value = null
    void load()
  },
  { immediate: true },
)
</script>

<template>
  <Dialog :open="props.open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogContent class="max-h-[90vh] max-w-5xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <MapPinned class="h-4 w-4 text-primary" /> Residency defaults for {{ props.bucket }}
        </DialogTitle>
        <DialogDescription>
          The whole residency policy set governs versions minted after this change; existing heads keep their own refs until a successor is minted.
        </DialogDescription>
      </DialogHeader>

      <div v-if="hidden" class="text-xs text-muted-foreground">
        Bucket residency defaults require realm configuration permission.
      </div>
      <div v-else-if="loading && !placement" class="space-y-3">
        <Skeleton class="h-20" />
        <Skeleton class="h-40" />
      </div>
      <ErrorPanel v-else-if="loadError" :message="loadError" @retry="load" />
      <template v-else-if="placement">
        <section class="space-y-4 rounded-lg border border-border p-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <h3 class="text-sm font-semibold text-foreground">Default residency policies</h3>
              <Badge variant="outline">generation {{ placement.generation }}</Badge>
            </div>
            <Button variant="outline" size="sm" @click="addPolicyRef"><Plus class="h-3.5 w-3.5" /> Add policy</Button>
          </div>
          <p class="text-[11px] text-muted-foreground">
            Saving replaces the complete default set. Removing every row and saving clears it.
          </p>

          <div v-if="policies.length" class="space-y-2">
            <div v-for="(policy, index) in policies" :key="index" class="grid gap-2 rounded-md border border-border bg-background p-3 md:grid-cols-[minmax(12rem,0.8fr)_minmax(20rem,1.4fr)_auto]">
              <div>
                <label class="text-[11px] font-medium text-foreground">Residency policy id</label>
                <Input v-model="policy.policy_id" class="mt-1 font-mono text-xs" :aria-label="`Residency policy id for default ${index + 1}`" />
              </div>
              <div>
                <label class="text-[11px] font-medium text-foreground">Definition digest</label>
                <Input v-model="policy.digest" class="mt-1 font-mono text-xs" :aria-label="`Digest for residency default ${index + 1}`" />
              </div>
              <Button variant="ghost" size="icon-sm" class="self-end text-destructive hover:text-destructive" :aria-label="`Remove residency policy ${index + 1}`" @click="removePolicyRef(index)">
                <Trash2 class="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <EmptyState v-else title="No bucket residency defaults" description="New versions are not constrained by a bucket-level residency policy set.">
            <Button @click="addPolicyRef"><Plus class="h-3.5 w-3.5" /> Add residency policy</Button>
          </EmptyState>

          <ul v-if="refErrors.length" class="list-disc space-y-1 pl-5 text-xs text-destructive">
            <li v-for="error in refErrors" :key="error">{{ error }}</li>
          </ul>
          <p v-if="saveError" class="text-xs text-destructive">{{ saveError }}</p>
          <p v-else-if="saveMessage" class="text-xs text-emerald-700 dark:text-emerald-300">{{ saveMessage }}</p>
          <div class="flex flex-wrap gap-2">
            <Button :disabled="saving || !dirty || refErrors.length > 0" @click="saveDefaults">
              <Save class="h-3.5 w-3.5" /> {{ saving ? 'Saving…' : 'Replace default set' }}
            </Button>
            <Button variant="outline" :disabled="saving" @click="load"><RefreshCw class="h-3.5 w-3.5" /> Reload</Button>
            <Button variant="outline" :disabled="bulkBusy || dirty" :title="dirty ? 'Save or reset the default set before applying it' : undefined" @click="bulkOpen = true"><Activity class="h-3.5 w-3.5" /> Apply to existing objects</Button>
          </div>
        </section>

        <section v-if="bulkOpen" class="space-y-4 rounded-lg border border-border p-4">
          <div>
            <h3 class="text-sm font-semibold text-foreground">Apply defaults to existing objects</h3>
            <p class="mt-1 text-[11px] text-muted-foreground">
              One client-generated operation id is resumed page by page. Completion exhausts only this responder's iterator.
            </p>
          </div>
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
            <p v-if="bulkProgress.message" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              {{ bulkProgress.message }}
            </p>
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
          <Button :disabled="bulkBusy" @click="startBulkRun">
            <Activity class="h-3.5 w-3.5" /> {{ bulkBusy ? 'Applying…' : bulkProgress ? 'Start a new run' : 'Start run' }}
          </Button>
        </section>

        <section class="space-y-4 rounded-lg border border-border p-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 class="text-sm font-semibold text-foreground">Responder-local coverage</h3>
              <p class="mt-1 text-[11px] text-muted-foreground">Switch between current heads and immutable historical versions.</p>
            </div>
            <div class="flex items-center gap-1" role="group" aria-label="Coverage scope">
              <Button size="sm" :variant="coverageScope === 'current' ? 'default' : 'outline'" :aria-pressed="coverageScope === 'current'" @click="setCoverageScope('current')">Current</Button>
              <Button size="sm" :variant="coverageScope === 'historical' ? 'default' : 'outline'" :aria-pressed="coverageScope === 'historical'" @click="setCoverageScope('historical')">Historical</Button>
            </div>
          </div>
          <div v-if="coverageLoading && !coverage" class="space-y-2"><Skeleton class="h-20" /><Skeleton class="h-32" /></div>
          <ErrorPanel v-else-if="coverageError" :message="coverageError" @retry="() => loadCoverage()" />
          <CoverageReport v-else-if="coverage" :report="coverage" />
          <div v-if="coverage?.cursor" class="flex justify-end">
            <Button variant="outline" size="sm" :disabled="coverageLoading" @click="loadCoverage(coverage.cursor)">Next responder page</Button>
          </div>
        </section>

        <DialogFooter>
          <DialogClose as-child><Button type="button" variant="outline">Close</Button></DialogClose>
        </DialogFooter>
      </template>
    </DialogContent>
  </Dialog>
</template>
