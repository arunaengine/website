<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
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
import Notice from '@/components/ui/Notice.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import StatCard from '@/components/ui/StatCard.vue'
import BucketPolicyDialog from '@/components/residency/BucketPolicyDialog.vue'
import ResidencyPolicyEditor from '@/components/residency/ResidencyPolicyEditor.vue'
import { useAruna } from '@/composables/useAruna'
import { usePlacementPolicies } from '@/composables/usePlacementPolicies'
import { useRefresh } from '@/composables/useRefresh'
import { placementPoliciesErrorMessage, policyRefKey } from '@/lib/placementPolicies'
import type {
  CopyViolationBody,
  DiagnosticsResponse,
  PolicyRefBody,
  PolicyResponse,
  QuarantineResolveResponse,
  SelectorBody,
} from '@/lib/placementPolicies'
import { formatBytes, formatNumber, truncateMiddle } from '@/lib/utils'
import {
  DatabaseZap,
  MapPinned,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
} from '@lucide/vue'

// AdminView owns the WRITE /{realm}/admin/config permission gate. This panel
// mirrors the placement feature flag.
const { bootstrapped, currentUser, isRealmAdmin } = useAruna()
const {
  getPlacementDiagnostics,
  getPlacementPolicy,
  listCursor,
  listComplete,
  listError,
  listLoadingMore,
  listState,
  listedPolicies,
  loadPolicyPage,
  residencyAdminEnabled,
  resolvePlacementQuarantine,
  sessionPolicies,
  sessionPolicyRefs,
} = usePlacementPolicies()

const ready = computed(
  () =>
    bootstrapped.value
    && residencyAdminEnabled.value
    && Boolean(currentUser.value)
    && isRealmAdmin.value,
)

// The realm listing when the node serves one, and the session-only refs when
// it does not; the two are never mixed, so the panel never implies the
// session library is the realm's complete set.
const listed = computed(() => listState.value === 'ready')
const libraryEntries = computed(() => {
  if (listed.value) {
    return listedPolicies.value.map((policy) => ({
      ref: { policy_id: policy.policy_id, digest: policy.digest },
      document: policy as PolicyResponse | undefined,
    }))
  }
  return sessionPolicyRefs.value.map((policy) => ({
    ref: policy,
    document: sessionPolicies.value.find((candidate) => policyRefKey(candidate) === policyRefKey(policy)),
  }))
})
const lookup = ref<PolicyRefBody>({ policy_id: '', digest: '' })
const lookupBusy = ref(false)
const lookupError = ref<string | null>(null)
const lookupMessage = ref<string | null>(null)

async function lookupPolicy(policy: PolicyRefBody = lookup.value) {
  if (!policy.policy_id.trim() || !/^[0-9a-f]{64}$/.test(policy.digest.trim()) || lookupBusy.value) return
  lookupBusy.value = true
  lookupError.value = null
  lookupMessage.value = null
  try {
    const stored = await getPlacementPolicy({
      policy_id: policy.policy_id.trim(),
      digest: policy.digest.trim(),
    })
    lookupMessage.value = `Loaded ${stored.name}.`
    lookup.value = { policy_id: '', digest: '' }
  } catch (error) {
    lookupError.value = placementPoliciesErrorMessage(error, 'lookup')
  } finally {
    lookupBusy.value = false
  }
}

function selectorSummary(selector: SelectorBody): string {
  const fields: string[] = []
  if (selector.node_id) fields.push(`node ${truncateMiddle(selector.node_id)}`)
  if (selector.location) fields.push(`location ${selector.location}`)
  for (const label of selector.labels) fields.push(`${label.key}=${label.value}`)
  if (selector.executor_kind) fields.push(`executor ${selector.executor_kind}`)
  return fields.join(' AND ')
}

const inspectedBucket = ref('')
const bucketDialogOpen = ref(false)
const bucketDialogName = ref('')

function inspectBucket() {
  const bucket = inspectedBucket.value.trim()
  if (!bucket) return
  bucketDialogName.value = bucket
  bucketDialogOpen.value = true
}

async function focusBucketInspector() {
  await nextTick()
  document.getElementById('residency-bucket-name')?.focus()
}

const diagnostics = ref<DiagnosticsResponse | null>(null)
const diagnosticsLoading = ref(false)
const diagnosticsError = ref<string | null>(null)

async function loadDiagnostics(cursor?: string) {
  diagnosticsLoading.value = true
  diagnosticsError.value = null
  try {
    diagnostics.value = await getPlacementDiagnostics({ cursor, limit: 128 })
  } catch (error) {
    diagnostics.value = null
    diagnosticsError.value = placementPoliciesErrorMessage(error)
  } finally {
    diagnosticsLoading.value = false
  }
}

const { busy: reloadBusy, refresh: onReload } = useRefresh(() => loadDiagnostics())
const spinning = computed(() => reloadBusy.value || diagnosticsLoading.value)

const resolutionBusy = ref(false)
const resolutionError = ref<string | null>(null)
const resolutionResult = ref<QuarantineResolveResponse | null>(null)
const releaseTarget = ref<CopyViolationBody | null>(null)

function confirmRelease(violation: CopyViolationBody) {
  resolutionError.value = null
  resolutionResult.value = null
  releaseTarget.value = violation
}

async function revalidateAll() {
  if (resolutionBusy.value) return
  resolutionBusy.value = true
  resolutionError.value = null
  resolutionResult.value = null
  try {
    resolutionResult.value = await resolvePlacementQuarantine({ action: 'revalidate' })
    await loadDiagnostics()
  } catch (error) {
    resolutionError.value = placementPoliciesErrorMessage(error, 'quarantine')
  } finally {
    resolutionBusy.value = false
  }
}

async function releaseCopy() {
  const target = releaseTarget.value
  if (!target || resolutionBusy.value) return
  resolutionBusy.value = true
  resolutionError.value = null
  resolutionResult.value = null
  try {
    resolutionResult.value = await resolvePlacementQuarantine({
      action: 'release',
      bucket: target.bucket,
      key: target.key,
      version_id: target.version_id,
    })
    releaseTarget.value = null
    await loadDiagnostics()
  } catch (error) {
    resolutionError.value = placementPoliciesErrorMessage(error, 'quarantine')
  } finally {
    resolutionBusy.value = false
  }
}

let loaded = false
watch(
  ready,
  (isReady) => {
    if (isReady && !loaded) {
      loaded = true
      void loadDiagnostics()
      void loadPolicyPage()
    }
  },
  { immediate: true },
)
</script>

<template>
  <div>
    <div v-if="!bootstrapped" class="container space-y-3 py-8">
      <Skeleton class="h-24" />
      <Skeleton class="h-40" />
    </div>

    <div v-else-if="!residencyAdminEnabled" class="container py-8">
      <section class="surface mx-auto max-w-xl p-8">
        <EmptyState title="Residency policy administration is not enabled" description="Enable features.placementAdmin for a backend that serves residency policy routes.">
          <template #icon><MapPinned class="h-8 w-8" /></template>
        </EmptyState>
      </section>
    </div>

    <div v-else class="container py-8">
      <p class="surface mb-6 px-5 py-3 text-sm text-muted-foreground">
        Residency policies constrain where governed data may reside, while placement strategies separately rank and replicate eligible storage.
      </p>

      <div class="grid gap-6 lg:grid-cols-[260px_1fr]">
        <nav class="flex flex-col gap-1 text-sm lg:sticky lg:top-20 lg:self-start">
          <a href="#residency-library" class="rounded-md bg-primary/5 px-3 py-2 font-medium text-primary">Residency policy library</a>
          <a href="#residency-publish" class="rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground">Publish policy</a>
          <a href="#residency-bucket" class="rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground">Bucket defaults</a>
          <a href="#residency-diagnostics" class="rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground">Diagnostics</a>
        </nav>

        <div class="space-y-6">
          <section id="residency-library" class="surface scroll-mt-24">
            <header class="flex items-center gap-2 border-b border-border px-5 py-4">
              <ShieldCheck class="h-4 w-4 text-primary" />
              <h3 class="font-display text-sm font-semibold text-aruna-navy">
                {{ listed ? 'Realm residency policy library' : 'Session residency policy library' }}
              </h3>
              <Badge variant="outline">{{ libraryEntries.length }}</Badge>
            </header>
            <div class="space-y-4 p-5">
              <Notice v-if="!listed" tone="warning">
                {{
                  listState === 'loading'
                    ? 'Reading the realm policy list…'
                    : 'This node serves no residency policy list. The library below contains only policies created this session, exact id and digest lookups, and refs found while inspecting buckets.'
                }}
              </Notice>
              <p v-else class="text-xs text-muted-foreground">
                Published policies as this node holds them, ordered by id. It is a replicated local
                view, so a very recent publication elsewhere may not be here yet.
              </p>
              <ErrorPanel
                v-if="listState === 'error'"
                :message="listError || 'The residency policy list could not be read.'"
                @retry="loadPolicyPage()"
              />
              <div class="grid gap-2 md:grid-cols-[minmax(12rem,0.8fr)_minmax(20rem,1.4fr)_auto]">
                <Input v-model="lookup.policy_id" class="font-mono text-xs" placeholder="Residency policy ULID" aria-label="Residency policy id lookup" />
                <Input v-model="lookup.digest" class="font-mono text-xs" placeholder="64-character lowercase digest" aria-label="Residency policy digest lookup" />
                <Button :disabled="lookupBusy || !lookup.policy_id.trim() || !/^[0-9a-f]{64}$/.test(lookup.digest.trim())" @click="lookupPolicy()">
                  <Search class="h-3.5 w-3.5" /> {{ lookupBusy ? 'Looking up…' : 'Look up' }}
                </Button>
              </div>
              <p v-if="lookupError" class="text-xs text-destructive">{{ lookupError }}</p>
              <p v-else-if="lookupMessage" class="text-xs text-emerald-700 dark:text-emerald-300">{{ lookupMessage }}</p>

              <div v-if="libraryEntries.length" class="space-y-3">
                <article v-for="entry in libraryEntries" :key="policyRefKey(entry.ref)" class="rounded-lg border border-border bg-background p-4">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="min-w-0">
                      <h4 class="text-sm font-semibold text-foreground">{{ entry.document?.name ?? 'Referenced residency policy' }}</h4>
                      <!-- A reference is the pair: an id alone could be answered
                           with other bytes, so both halves are always shown. -->
                      <dl class="mt-1 grid grid-cols-[4rem_minmax(0,1fr)] gap-x-2 text-[11px]">
                        <dt class="text-muted-foreground">policy_id</dt>
                        <dd class="font-mono text-muted-foreground">{{ entry.ref.policy_id }}</dd>
                        <dt class="text-muted-foreground">digest</dt>
                        <dd class="break-all font-mono text-[10px] text-muted-foreground">{{ entry.ref.digest }}</dd>
                      </dl>
                    </div>
                    <Button v-if="!entry.document" variant="outline" size="sm" :disabled="lookupBusy" @click="lookupPolicy(entry.ref)">Load definition</Button>
                    <Badge v-else variant="success">authenticated definition</Badge>
                  </div>
                  <template v-if="entry.document">
                    <div class="mt-3 flex flex-wrap gap-1.5">
                      <Badge v-for="(selector, index) in entry.document.allowed" :key="index" variant="outline">
                        {{ selectorSummary(selector) }}
                      </Badge>
                    </div>
                    <p class="mt-3 text-[11px] text-muted-foreground">
                      Published by <span class="font-mono">{{ truncateMiddle(entry.document.publisher) }}</span>
                      at {{ new Date(entry.document.created_at_ms).toLocaleString() }}.
                    </p>
                  </template>
                </article>
                <div v-if="listed && listCursor" class="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" :disabled="listLoadingMore" @click="loadPolicyPage(true)">
                    {{ listLoadingMore ? 'Loading…' : 'Load more' }}
                  </Button>
                  <span class="text-[11px] text-muted-foreground">{{ libraryEntries.length }} loaded</span>
                </div>
                <p v-else-if="listed && !listComplete" class="text-[11px] text-muted-foreground">
                  This page is bounded, so a policy may exist that it did not list.
                </p>
              </div>
              <EmptyState
                v-else-if="listed"
                title="No residency policies published"
                description="This node holds no published residency policy for the realm yet."
              >
                <Button @click="focusBucketInspector">Inspect a bucket</Button>
              </EmptyState>
              <EmptyState v-else title="No session residency policies" description="Publish a policy, look up an exact ref, or inspect a bucket to populate this session-only library.">
                <Button @click="focusBucketInspector">Inspect a bucket</Button>
              </EmptyState>
            </div>
          </section>

          <section id="residency-publish" class="surface scroll-mt-24">
            <header class="flex items-center gap-2 border-b border-border px-5 py-4">
              <MapPinned class="h-4 w-4 text-primary" />
              <h3 class="font-display text-sm font-semibold text-aruna-navy">Publish an immutable residency policy</h3>
            </header>
            <div class="p-5"><ResidencyPolicyEditor /></div>
          </section>

          <section id="residency-bucket" class="surface scroll-mt-24">
            <header class="flex items-center gap-2 border-b border-border px-5 py-4">
              <DatabaseZap class="h-4 w-4 text-primary" />
              <h3 class="font-display text-sm font-semibold text-aruna-navy">Inspect bucket residency</h3>
            </header>
            <div class="space-y-3 p-5">
              <p class="text-[11px] text-muted-foreground">
                Open a bucket's CAS-protected default set, responder-local coverage, and bulk application flow.
              </p>
              <div class="flex flex-wrap items-center gap-2">
                <Input id="residency-bucket-name" v-model="inspectedBucket" class="max-w-sm" placeholder="Bucket name" aria-label="Bucket to inspect" @keydown.enter="inspectBucket" />
                <Button :disabled="!inspectedBucket.trim()" @click="inspectBucket"><Search class="h-3.5 w-3.5" /> Inspect bucket</Button>
              </div>
            </div>
          </section>

          <section id="residency-diagnostics" class="surface scroll-mt-24">
            <header class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
              <div class="flex items-center gap-2">
                <ShieldAlert class="h-4 w-4 text-primary" />
                <h3 class="font-display text-sm font-semibold text-aruna-navy">Local enforcement diagnostics and quarantine</h3>
              </div>
              <div class="flex gap-2">
                <RefreshButton :busy="spinning" label="Reload" @click="onReload" />
                <Button size="sm" :disabled="resolutionBusy" @click="revalidateAll">
                  <RotateCcw class="h-3.5 w-3.5" /> {{ resolutionBusy ? 'Revalidating…' : 'Revalidate all' }}
                </Button>
              </div>
            </header>
            <div class="space-y-5 p-5">
              <div v-if="diagnosticsLoading && !diagnostics" class="space-y-2"><Skeleton class="h-20" /><Skeleton class="h-32" /></div>
              <ErrorPanel v-else-if="diagnosticsError" :message="diagnosticsError" @retry="loadDiagnostics" />
              <template v-else-if="diagnostics">
                <div class="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs">
                  <span class="font-medium text-foreground">Subject:</span>
                  <span>{{ diagnostics.subject_location ?? 'not advertised' }}</span>
                  <span v-if="diagnostics.subject_generation != null" class="text-muted-foreground">generation {{ diagnostics.subject_generation }}</span>
                  <Badge :variant="diagnostics.policy_draining ? 'warn' : 'success'">{{ diagnostics.policy_draining ? 'residency draining' : 'not residency draining' }}</Badge>
                  <Badge :variant="diagnostics.serving_blocked ? 'destructive' : 'success'">{{ diagnostics.serving_blocked ? 'serving blocked' : 'serving open' }}</Badge>
                  <Badge :variant="diagnostics.complete ? 'success' : 'warn'">{{ diagnostics.complete ? 'responder page complete' : 'more responder rows' }}</Badge>
                </div>

                <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard label="Observed" :value="formatNumber(diagnostics.observed)" />
                  <StatCard label="Registered" :value="formatNumber(diagnostics.registered)" />
                  <StatCard label="Quarantined" :value="formatNumber(diagnostics.quarantined)" />
                  <StatCard label="Unresolved departed" :value="formatNumber(diagnostics.unresolved_departed)" />
                </div>

                <div class="rounded-md border border-border p-3">
                  <div class="flex flex-wrap items-center gap-2 text-xs">
                    <span class="font-medium text-foreground">Residency policy cache</span>
                    <span>{{ formatNumber(diagnostics.cache_entries) }} entries</span>
                    <span>{{ formatNumber(diagnostics.cache_verified) }} verified</span>
                    <span>{{ formatNumber(diagnostics.cache_unavailable) }} unavailable</span>
                    <span>{{ formatBytes(diagnostics.cache_bytes) }}</span>
                    <Badge v-if="diagnostics.cache_truncated" variant="warn">cache scan truncated</Badge>
                    <Badge v-else variant="outline">cache scan not truncated</Badge>
                  </div>
                  <p class="mt-1 text-[11px] text-muted-foreground">Cache figures are diagnostics only and never residency policy truth.</p>
                </div>

                <div v-if="diagnostics.violations.length" class="overflow-x-auto rounded-md border border-border">
                  <table class="w-full min-w-[840px] text-left text-xs">
                    <caption class="caption-top px-3 py-2 text-left text-[11px] text-muted-foreground">
                      Exact local versions reported as quarantined or unresolved after departure.
                    </caption>
                    <thead class="border-y border-border bg-muted/40 text-muted-foreground">
                      <tr><th class="px-3 py-2 font-medium">Bucket and key</th><th class="px-3 py-2 font-medium">Version</th><th class="px-3 py-2 font-medium">State</th><th class="px-3 py-2 font-medium">Residency refs</th><th class="px-3 py-2"><span class="sr-only">Actions</span></th></tr>
                    </thead>
                    <tbody class="divide-y divide-border">
                      <tr v-for="violation in diagnostics.violations" :key="`${violation.bucket}:${violation.key}:${violation.version_id}`">
                        <td class="px-3 py-2"><div class="font-medium">{{ violation.bucket }}</div><div class="font-mono text-[11px] text-muted-foreground">{{ violation.key }}</div></td>
                        <td class="px-3 py-2 font-mono" :title="violation.version_id">{{ truncateMiddle(violation.version_id) }}</td>
                        <td class="px-3 py-2"><Badge :variant="violation.state === 'quarantined' ? 'destructive' : 'warn'">{{ violation.state.replaceAll('_', ' ') }}</Badge></td>
                        <td class="px-3 py-2"><div v-for="policy in violation.policies" :key="policyRefKey(policy)" class="font-mono text-[10px]" :title="`${policy.policy_id}:${policy.digest}`">{{ truncateMiddle(policy.policy_id) }} / {{ truncateMiddle(policy.digest, 8, 6) }}</div></td>
                        <td class="px-3 py-2 text-right"><Button variant="destructive" size="sm" :disabled="resolutionBusy" @click="confirmRelease(violation)">Release</Button></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <EmptyState v-else title="No local residency violations" description="This responder did not report a quarantined or unresolved-departed copy in the current page." />
                <p class="text-[11px] text-muted-foreground">
                  Complete refers only to this node's bounded copy iterator and never to realm-wide enforcement convergence.
                </p>
                <div v-if="diagnostics.cursor" class="flex justify-end">
                  <Button variant="outline" size="sm" :disabled="diagnosticsLoading" @click="loadDiagnostics(diagnostics.cursor)">Next responder page</Button>
                </div>
              </template>

              <p v-if="resolutionError" class="text-xs text-destructive">{{ resolutionError }}</p>
              <div v-else-if="resolutionResult" class="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
                {{ resolutionResult.released ? 'Released the requested local registration. ' : '' }}
                Scanned {{ resolutionResult.scanned }}, restored {{ resolutionResult.restored }}, quarantined {{ resolutionResult.quarantined }}.
                {{ resolutionResult.cleared ? 'Governed admission and serving are open on this node.' : 'This node remains safely draining.' }}
              </div>
            </div>
          </section>
        </div>
      </div>

      <BucketPolicyDialog v-model:open="bucketDialogOpen" :bucket="bucketDialogName" />

      <Dialog :open="releaseTarget !== null" @update:open="(value: boolean) => { if (!value && !resolutionBusy) releaseTarget = null }">
        <DialogContent class="max-w-md">
          <DialogHeader>
            <DialogTitle>Release this local copy?</DialogTitle>
            <DialogDescription>
              Release drops this node's registrations for the exact version below. If it clears the last quarantined copy, governed serving reopens on this node.
            </DialogDescription>
          </DialogHeader>
          <div v-if="releaseTarget" class="rounded-md border border-border bg-muted/20 p-3 font-mono text-xs">
            <div>{{ releaseTarget.bucket }}</div>
            <div class="break-all">{{ releaseTarget.key }}</div>
            <div>{{ releaseTarget.version_id }}</div>
          </div>
          <p v-if="resolutionError" class="text-xs text-destructive">{{ resolutionError }}</p>
          <DialogFooter>
            <DialogClose as-child><Button variant="outline" :disabled="resolutionBusy">Cancel</Button></DialogClose>
            <Button variant="destructive" :disabled="resolutionBusy" @click="releaseCopy">
              {{ resolutionBusy ? 'Releasing…' : 'Release exact version' }}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  </div>
</template>
