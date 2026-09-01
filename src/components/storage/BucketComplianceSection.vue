<script setup lang="ts">
// What this node found when it walked the objects it holds for this bucket.
// Observed only: it counts objects that CARRY the rules, which is not proof
// that every copy of them sits somewhere the rules allow.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Notice from '@/components/ui/Notice.vue'
import RefusalNote from '@/components/ui/RefusalNote.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Spinner from '@/components/ui/Spinner.vue'
import StatCard from '@/components/ui/StatCard.vue'
import CoverageReport from '@/components/placement/CoverageReport.vue'
import { usePlacementPolicies } from '@/composables/usePlacementPolicies'
import { ApiError } from '@/lib/api'
import { placementPoliciesErrorMessage, runBulkToCompletion } from '@/lib/placementPolicies'
import type { BulkRunProgress, CoverageResponse, CoverageScope } from '@/lib/placementPolicies'
import { formatNumber } from '@/lib/utils'
import { Activity, ClipboardCheck } from '@lucide/vue'

const props = defineProps<{ bucket: string; canApply: boolean; blockedReason: string | null }>()

const { getPlacementCoverage, runBucketPlacement } = usePlacementPolicies()

const scope = ref<CoverageScope>('current')
const coverage = ref<CoverageResponse | null>(null)
const loading = ref(false)
const refusal = ref<string | null>(null)
const loadError = ref<string | null>(null)

const bulkBusy = ref(false)
const bulkProgress = ref<BulkRunProgress | null>(null)
const bulkError = ref<string | null>(null)
const staleRun = Symbol('stale placement run')
let runGeneration = 0
let disposed = false

const covered = computed(() =>
  coverage.value ? Math.max(0, coverage.value.observed - coverage.value.gaps.length) : null,
)

let sequence = 0
async function load(cursor?: string) {
  const request = ++sequence
  loading.value = true
  refusal.value = null
  loadError.value = null
  try {
    const report = await getPlacementCoverage(props.bucket, { scope: scope.value, cursor, limit: 128 })
    if (request === sequence) coverage.value = report
  } catch (error) {
    if (request !== sequence) return
    coverage.value = null
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      refusal.value =
        error.message || 'This node refused to report the compliance of this bucket.'
    } else loadError.value = placementPoliciesErrorMessage(error)
  } finally {
    if (request === sequence) loading.value = false
  }
}

function setScope(next: CoverageScope) {
  if (scope.value === next) return
  scope.value = next
  void load()
}

watch(
  () => props.bucket,
  () => {
    runGeneration += 1
    bulkBusy.value = false
    bulkProgress.value = null
    bulkError.value = null
    scope.value = 'current'
    coverage.value = null
    void load()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  disposed = true
  runGeneration += 1
})

async function applyToExisting() {
  if (bulkBusy.value || !props.canApply) return
  const bucket = props.bucket
  const generation = ++runGeneration
  const current = () => generation === runGeneration && !disposed && props.bucket === bucket
  bulkBusy.value = true
  bulkError.value = null
  bulkProgress.value = null
  try {
    const progress = await runBulkToCompletion(
      (request) => {
        if (!current()) throw staleRun
        return runBucketPlacement(bucket, request)
      },
      (progress) => {
        if (current()) bulkProgress.value = { ...progress }
      },
    )
    if (!current()) return
    bulkProgress.value = progress
    void load()
  } catch (error) {
    if (error === staleRun || !current()) return
    bulkError.value = placementPoliciesErrorMessage(error, 'bulk')
  } finally {
    if (generation === runGeneration) bulkBusy.value = false
  }
}
</script>

<template>
  <section class="surface">
    <header class="flex items-center gap-2 border-b border-border px-5 py-4">
      <ClipboardCheck class="size-4 text-primary" />
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Compliance on this node</h2>
    </header>

    <div class="space-y-4 px-5 py-4">
      <p class="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        <span>
          Counted on this node only. A covered object carries the rules; that is not proof that
          every copy of it complies.
        </span>
        <DocsLink topic="where-data-lives" section="Placement policies" label="Learn what coverage means" />
      </p>

      <RefusalNote v-if="refusal" :message="refusal" />
      <ErrorPanel v-else-if="loadError" :message="loadError" @retry="() => load()" />
      <div v-else-if="loading && !coverage" class="space-y-2">
        <Skeleton class="h-16" />
        <Skeleton class="h-32" />
      </div>

      <template v-else-if="coverage">
        <div class="grid gap-3 sm:grid-cols-2">
          <StatCard label="Objects carrying the rules" :value="formatNumber(covered ?? 0)" />
          <StatCard label="Objects this node listed" :value="formatNumber(coverage.observed)" />
        </div>

        <div class="flex items-center gap-1" role="group" aria-label="Which versions are counted">
          <Button
            size="sm"
            :variant="scope === 'current' ? 'default' : 'outline'"
            :aria-pressed="scope === 'current'"
            @click="setScope('current')"
          >
            Current versions
          </Button>
          <Button
            size="sm"
            :variant="scope === 'historical' ? 'default' : 'outline'"
            :aria-pressed="scope === 'historical'"
            @click="setScope('historical')"
          >
            Older versions too
          </Button>
        </div>

        <CoverageReport :report="coverage" />

        <div v-if="coverage.cursor" class="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            :disabled="loading"
            :aria-busy="loading"
            @click="load(coverage.cursor)"
          >
            <Spinner v-if="loading" label="Loading the next page" class="text-current" /> Next page
          </Button>
        </div>

        <div class="space-y-2 border-t border-border pt-4">
          <p class="text-xs text-muted-foreground">
            Applying attaches the bucket's rules to objects that were written before. It attaches
            rules and copies nothing.
          </p>
          <div v-if="bulkProgress" class="space-y-2">
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Looked at" :value="formatNumber(bulkProgress.observed)" />
              <StatCard label="Already carried them" :value="formatNumber(bulkProgress.covered)" />
              <StatCard label="Newly carrying them" :value="formatNumber(bulkProgress.minted)" />
              <StatCard label="Refused" :value="formatNumber(bulkProgress.blocked.length)" />
            </div>
            <Notice v-if="bulkProgress.message" tone="warning">{{ bulkProgress.message }}</Notice>
            <div v-if="bulkProgress.blocked.length" class="overflow-x-auto rounded-md border border-border">
              <table class="w-full min-w-[480px] text-left text-xs">
                <thead class="border-b border-border bg-muted/40 text-muted-foreground">
                  <tr>
                    <th class="px-3 py-2 font-medium">Refused key</th>
                    <th class="px-3 py-2 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border">
                  <tr v-for="gap in bulkProgress.blocked" :key="`${gap.key}:${gap.reason}`">
                    <td class="px-3 py-2 font-mono">{{ gap.key }}</td>
                    <td class="px-3 py-2">{{ gap.reason }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <RefusalNote v-if="bulkError" :message="bulkError" />
          <div class="flex flex-wrap items-center gap-2">
            <Button variant="outline" :disabled="bulkBusy || !props.canApply" @click="applyToExisting">
              <Activity class="size-3.5" />
              {{ bulkBusy ? 'Applying…' : bulkProgress ? 'Apply again' : 'Apply to existing files' }}
            </Button>
            <Badge v-if="!props.canApply && props.blockedReason" variant="outline">
              {{ props.blockedReason }}
            </Badge>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>
