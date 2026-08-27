<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import StatCard from '@/components/ui/StatCard.vue'
import Switch from '@/components/ui/Switch.vue'
import ComputeQuotaFields from '@/components/compute-admin/ComputeQuotaFields.vue'
import { useAruna } from '@/composables/useAruna'
import { useComputeAdmin } from '@/composables/useComputeAdmin'
import { useRefresh } from '@/composables/useRefresh'
import {
  BYTE_UNITS,
  computeAdminErrorMessage,
  computeConfigBodyFromDraft,
  computeConfigDraftFromBody,
  emptyQuotaDraft,
  isComputeAdminUnsupported,
  validateComputeConfigDraft,
} from '@/lib/computeAdmin'
import type {
  ComputeConfigBody,
  ComputeConfigDraft,
  ComputeSnapshotsResponse,
} from '@/lib/computeAdmin'
import { knownLocations as placementLocations } from '@/lib/placement'
import { formatBytes, formatDuration, formatNumber, truncateMiddle } from '@/lib/utils'
import {
  Activity,
  ArrowRight,
  Gauge,
  Network,
  Plus,
  Save,
  ServerCog,
  Trash2,
} from '@lucide/vue'

// AdminView owns the WRITE /{realm}/admin/config permission gate.
const {
  bootstrapped,
  currentUser,
  discoverableGroups,
  isRealmAdmin,
  myGroups,
  realmInfo,
} = useAruna()
const { getComputeConfig, getComputeSnapshots, putComputeConfig, setComputeDrain } = useComputeAdmin()

const ready = computed(
  () =>
    bootstrapped.value
    && Boolean(currentUser.value)
    && isRealmAdmin.value,
)
const knownLocations = computed(() => placementLocations(realmInfo.value?.nodes ?? []))
const bandwidthUnitOptions = BYTE_UNITS.map(({ value, label }) => ({ value, label: `${label}/s` }))
const groupOptions = computed(() => {
  const labels = new Map<string, string>()
  for (const group of [...myGroups.value, ...discoverableGroups.value]) labels.set(group.id, group.name)
  for (const entry of draft.value?.group_quotas ?? []) {
    if (!labels.has(entry.group_id)) labels.set(entry.group_id, entry.group_id)
  }
  return [...labels].map(([value, label]) => ({ value, label }))
})

const config = ref<ComputeConfigBody | null>(null)
const draft = ref<ComputeConfigDraft | null>(null)
const baseline = ref('')
const loading = ref(false)
const unsupported = ref(false)
const loadError = ref<string | null>(null)
const saving = ref(false)
const saveError = ref<string | null>(null)
const saveMessage = ref<string | null>(null)

const dirty = computed(() => Boolean(draft.value && JSON.stringify(draft.value) !== baseline.value))
const clientErrors = computed(() => draft.value ? validateComputeConfigDraft(draft.value) : [])

function seedConfig(stored: ComputeConfigBody) {
  config.value = stored
  draft.value = computeConfigDraftFromBody(stored)
  baseline.value = JSON.stringify(draft.value)
}

async function loadConfig() {
  loading.value = true
  unsupported.value = false
  loadError.value = null
  saveError.value = null
  saveMessage.value = null
  try {
    seedConfig(await getComputeConfig())
  } catch (error) {
    config.value = null
    draft.value = null
    if (isComputeAdminUnsupported(error)) unsupported.value = true
    else loadError.value = computeAdminErrorMessage(error)
  } finally {
    loading.value = false
  }
}

function resetConfig() {
  if (config.value) seedConfig(config.value)
  saveError.value = null
  saveMessage.value = null
}

async function saveConfig() {
  if (!draft.value || clientErrors.value.length || saving.value || !dirty.value) return
  saving.value = true
  saveError.value = null
  saveMessage.value = null
  try {
    // The draft was seeded from GET and contains every field required by the
    // whole-config PUT, so links and quota sections are never sent as patches.
    const stored = await putComputeConfig(computeConfigBodyFromDraft(draft.value))
    seedConfig(stored)
    saveMessage.value = 'Whole compute configuration saved.'
  } catch (error) {
    saveError.value = computeAdminErrorMessage(error)
  } finally {
    saving.value = false
  }
}

function addLink() {
  draft.value?.links.push({
    from: '',
    to: '',
    bandwidth: { value: '', unit: 'MiB' },
  })
}

function removeLink(index: number) {
  draft.value?.links.splice(index, 1)
}

function addGroupQuota() {
  if (!draft.value) return
  const selected = new Set(draft.value.group_quotas.map((entry) => entry.group_id))
  const groupId = groupOptions.value.find((option) => !selected.has(option.value))?.value ?? ''
  draft.value.group_quotas.push({ group_id: groupId, quota: emptyQuotaDraft() })
}

function removeGroupQuota(index: number) {
  draft.value?.group_quotas.splice(index, 1)
}

const snapshots = ref<ComputeSnapshotsResponse | null>(null)
const snapshotGroupId = ref('')
const snapshotLoading = ref(false)
const snapshotError = ref<string | null>(null)

async function loadSnapshots() {
  snapshotLoading.value = true
  snapshotError.value = null
  try {
    snapshots.value = await getComputeSnapshots(snapshotGroupId.value || undefined)
  } catch (error) {
    snapshotError.value = computeAdminErrorMessage(error)
  } finally {
    snapshotLoading.value = false
  }
}

function clearSnapshotGroup() {
  snapshotGroupId.value = ''
  void loadSnapshots()
}

const drainBusy = ref(false)
const drainError = ref<string | null>(null)
const drainMessage = ref<string | null>(null)

async function setDrain(draining: boolean) {
  if (drainBusy.value) return
  drainBusy.value = true
  drainError.value = null
  drainMessage.value = null
  try {
    const response = await setComputeDrain(draining)
    if (snapshots.value) snapshots.value.operator_draining = response.draining
    drainMessage.value = response.changed
      ? `This node is now ${response.draining ? 'draining' : 'accepting new compute work'}.`
      : `This node was already ${response.draining ? 'draining' : 'accepting new compute work'}.`
  } catch (error) {
    drainError.value = computeAdminErrorMessage(error)
  } finally {
    drainBusy.value = false
  }
}

function groupName(groupId: string): string {
  return groupOptions.value.find((option) => option.value === groupId)?.label ?? groupId
}

function quotaValue(value: number | undefined, kind: 'count' | 'bytes' | 'duration' = 'count'): string {
  if (value == null) return 'Unbounded'
  if (kind === 'bytes') return formatBytes(value)
  if (kind === 'duration') return formatDuration(value)
  return formatNumber(value)
}

function observedAt(milliseconds: number): string {
  return new Date(milliseconds).toLocaleString()
}

async function loadAll() {
  await Promise.all([loadConfig(), loadSnapshots()])
}

const { busy: reloadBusy, refresh: onReloadAll } = useRefresh(loadAll)
const reloadSpinning = computed(() => reloadBusy.value || loading.value || snapshotLoading.value)
const { busy: snapshotBusy, refresh: onReloadSnapshots } = useRefresh(loadSnapshots)
const snapshotSpinning = computed(() => snapshotBusy.value || snapshotLoading.value)

let loaded = false
watch(
  ready,
  (isReady) => {
    if (isReady && !loaded) {
      loaded = true
      void loadAll()
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

    <div v-else class="container py-8">
      <p class="surface mb-6 px-5 py-3 text-sm text-muted-foreground">
        Compute administration controls execution admission and capacity signals, while placement strategies separately govern data placement.
      </p>

      <div class="grid gap-6 lg:grid-cols-[260px_1fr]">
        <nav class="flex flex-col gap-1 text-sm lg:sticky lg:top-20 lg:self-start">
          <a href="#compute-links" class="rounded-md bg-primary/5 px-3 py-2 font-medium text-primary">Bandwidth links</a>
          <a href="#compute-quotas" class="rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground">Group quotas</a>
          <a href="#compute-snapshots" class="rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground">Snapshots</a>
          <a href="#compute-drain" class="rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground">Drain</a>
        </nav>

        <div class="space-y-6">
          <div class="flex justify-end">
            <RefreshButton :busy="reloadSpinning" label="Reload" @click="onReloadAll" />
          </div>

          <template v-if="loading && !draft">
            <Skeleton class="h-44" />
            <Skeleton class="h-64" />
          </template>
          <section v-else-if="unsupported" class="surface p-5">
            <EmptyState
              title="Compute configuration is unavailable"
              description="This node returned no compute configuration; it may not hold the realm document or may not serve /admin/compute/config."
            >
              <Button @click="loadConfig">Try again</Button>
            </EmptyState>
          </section>
          <ErrorPanel v-else-if="loadError" :message="loadError" @retry="loadConfig" />

          <template v-else-if="draft">
            <section id="compute-links" class="surface scroll-mt-24">
              <header class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
                <div class="flex items-center gap-2">
                  <Network class="h-4 w-4 text-primary" />
                  <h3 class="font-display text-sm font-semibold text-aruna-navy">Directed bandwidth links</h3>
                </div>
                <Button size="sm" variant="outline" @click="addLink"><Plus class="h-3.5 w-3.5" /> Add link</Button>
              </header>
              <div class="space-y-5 p-5">
                <div v-if="draft.links.length" class="overflow-x-auto rounded-md border border-border">
                  <table class="w-full min-w-[680px] text-left text-xs">
                    <caption class="caption-top px-3 py-2 text-left text-[11px] text-muted-foreground">
                      Links are directed: eu to us and us to eu are distinct entries and may have different bandwidth.
                    </caption>
                    <thead class="border-y border-border bg-muted/40 text-muted-foreground">
                      <tr>
                        <th class="px-3 py-2 font-medium">From location</th>
                        <th class="w-8 px-1 py-2"><span class="sr-only">Direction</span></th>
                        <th class="px-3 py-2 font-medium">To location</th>
                        <th class="px-3 py-2 font-medium">Bandwidth</th>
                        <th class="w-12 px-3 py-2"><span class="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-border">
                      <tr v-for="(link, index) in draft.links" :key="index">
                        <td class="px-3 py-2">
                          <Input v-model="link.from" list="compute-locations" :aria-label="`From location for link ${index + 1}`" />
                        </td>
                        <td class="px-1 py-2 text-muted-foreground"><ArrowRight class="h-4 w-4" /></td>
                        <td class="px-3 py-2">
                          <Input v-model="link.to" list="compute-locations" :aria-label="`To location for link ${index + 1}`" />
                        </td>
                        <td class="px-3 py-2">
                          <div class="flex gap-2">
                            <Input v-model="link.bandwidth.value" type="number" min="0" class="min-w-28" :aria-label="`Bandwidth for link ${index + 1}`" />
                            <Select v-model="link.bandwidth.unit" :options="bandwidthUnitOptions" class="w-28 shrink-0" :aria-label="`Bandwidth unit for link ${index + 1}`" />
                          </div>
                        </td>
                        <td class="px-3 py-2 text-right">
                          <Button variant="ghost" size="icon-sm" class="text-destructive hover:text-destructive" :aria-label="`Remove link ${index + 1}`" @click="removeLink(index)">
                            <Trash2 class="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <EmptyState v-else title="No directed links" description="Add a link to replace the pessimistic default for one transfer direction.">
                  <Button @click="addLink"><Plus class="h-3.5 w-3.5" /> Add link</Button>
                </EmptyState>
                <datalist id="compute-locations">
                  <option v-for="location in knownLocations" :key="location" :value="location" />
                </datalist>

                <div class="grid gap-4 md:grid-cols-3">
                  <div>
                    <label class="text-xs font-medium text-foreground">Pessimistic default bandwidth</label>
                    <div class="mt-1 flex gap-2">
                      <Input v-model="draft.pessimistic_bandwidth.value" type="number" min="0" aria-label="Pessimistic default bandwidth" />
                      <Select v-model="draft.pessimistic_bandwidth.unit" :options="bandwidthUnitOptions" class="w-28 shrink-0" aria-label="Pessimistic default bandwidth unit" />
                    </div>
                    <p class="mt-1 text-[11px] text-muted-foreground">
                      Used when no directed link is configured.
                    </p>
                  </div>
                  <div>
                    <label class="text-xs font-medium text-foreground">Availability stale after (ms)</label>
                    <Input v-model="draft.availability_stale_after_ms" type="number" min="0" step="1" class="mt-1" />
                  </div>
                  <div>
                    <label class="text-xs font-medium text-foreground">Witness base delay (ms)</label>
                    <Input v-model="draft.witness_base_delay_ms" type="number" min="1" step="1" class="mt-1" />
                    <p class="mt-1 text-[11px] text-muted-foreground">Must be greater than zero.</p>
                  </div>
                </div>
              </div>
            </section>

            <section id="compute-quotas" class="surface scroll-mt-24">
              <header class="flex items-center gap-2 border-b border-border px-5 py-4">
                <Gauge class="h-4 w-4 text-primary" />
                <h3 class="font-display text-sm font-semibold text-aruna-navy">Compute quotas</h3>
              </header>
              <div class="space-y-6 p-5">
                <div>
                  <h4 class="text-xs font-semibold text-foreground">Realm default quota</h4>
                  <p class="mt-1 text-[11px] text-muted-foreground">
                    An empty field is unbounded and is omitted from the request, never serialized as zero.
                  </p>
                  <ComputeQuotaFields v-model="draft.default_group_quota" class="mt-3" />
                </div>

                <div class="border-t border-border pt-5">
                  <div class="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h4 class="text-xs font-semibold text-foreground">Per-group overrides</h4>
                      <p class="mt-1 text-[11px] text-muted-foreground">
                        A group override replaces the realm default wholesale; omitted dimensions stay unbounded and are not merged from the default.
                      </p>
                    </div>
                    <Button size="sm" variant="outline" @click="addGroupQuota"><Plus class="h-3.5 w-3.5" /> Add override</Button>
                  </div>
                  <div v-if="draft.group_quotas.length" class="mt-4 space-y-3">
                    <div v-for="(entry, index) in draft.group_quotas" :key="index" class="rounded-lg border border-border bg-background p-4">
                      <div class="mb-4 flex items-center gap-2">
                        <Select v-model="entry.group_id" :options="groupOptions" placeholder="Select group" class="max-w-sm flex-1" :aria-label="`Group for quota override ${index + 1}`" />
                        <Button variant="ghost" size="icon-sm" class="ml-auto text-destructive hover:text-destructive" :aria-label="`Remove quota override ${index + 1}`" @click="removeGroupQuota(index)">
                          <Trash2 class="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <ComputeQuotaFields v-model="entry.quota" />
                    </div>
                  </div>
                  <EmptyState v-else class="mt-4" title="No group overrides" description="Every group currently uses the realm default compute quota.">
                    <Button @click="addGroupQuota"><Plus class="h-3.5 w-3.5" /> Add override</Button>
                  </EmptyState>
                </div>

                <div class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                  Saving replaces the whole compute configuration, including every bandwidth link and group quota shown here.
                </div>
                <ul v-if="clientErrors.length" class="list-disc space-y-1 pl-5 text-xs text-destructive">
                  <li v-for="error in clientErrors" :key="error">{{ error }}</li>
                </ul>
                <p v-if="saveError" class="text-xs text-destructive">{{ saveError }}</p>
                <p v-else-if="saveMessage" class="text-xs text-emerald-700 dark:text-emerald-300">{{ saveMessage }}</p>
                <div class="flex flex-wrap gap-2">
                  <Button :disabled="!dirty || saving || clientErrors.length > 0" @click="saveConfig">
                    <Save class="h-3.5 w-3.5" /> {{ saving ? 'Saving…' : 'Save whole configuration' }}
                  </Button>
                  <Button variant="ghost" :disabled="!dirty || saving" @click="resetConfig">Reset</Button>
                </div>
              </div>
            </section>
          </template>

          <section id="compute-snapshots" class="surface scroll-mt-24">
            <header class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
              <div class="flex items-center gap-2">
                <Activity class="h-4 w-4 text-primary" />
                <h3 class="font-display text-sm font-semibold text-aruna-navy">Approximate replicated view</h3>
                <Badge v-if="snapshots?.approximate ?? true" variant="warn">approximate</Badge>
              </div>
              <RefreshButton :busy="snapshotSpinning" @click="onReloadSnapshots" />
            </header>
            <div class="space-y-5 p-5">
              <p class="text-[11px] text-muted-foreground">
                Reserved resources are physical per-node capacity; group demand is logical admitted work. They are separate controls and are never summed.
              </p>
              <ErrorPanel v-if="snapshotError" :message="snapshotError" @retry="loadSnapshots" />
              <template v-else-if="snapshots">
                <div v-if="snapshots.nodes.length" class="overflow-x-auto rounded-md border border-border">
                  <table class="w-full min-w-[880px] text-left text-xs">
                    <thead class="border-b border-border bg-muted/40 text-muted-foreground">
                      <tr>
                        <th class="px-3 py-2 font-medium">Node</th>
                        <th class="px-3 py-2 font-medium">Reserved jobs</th>
                        <th class="px-3 py-2 font-medium">Reserved CPU</th>
                        <th class="px-3 py-2 font-medium">Reserved RAM</th>
                        <th class="px-3 py-2 font-medium">Reserved disk</th>
                        <th class="px-3 py-2 font-medium">Demand view</th>
                        <th class="px-3 py-2 font-medium">State</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-border">
                      <tr v-for="node in snapshots.nodes" :key="node.node_id">
                        <td class="px-3 py-2">
                          <div class="font-mono" :title="node.node_id">{{ truncateMiddle(node.node_id) }}</div>
                          <div class="mt-0.5 text-[10px] text-muted-foreground" :title="observedAt(node.observed_at_ms)">
                            observed {{ observedAt(node.observed_at_ms) }}
                          </div>
                          <div class="text-[10px] text-muted-foreground">membership {{ node.membership_generation }}, publisher {{ node.publisher_generation }}</div>
                        </td>
                        <td class="px-3 py-2 font-mono">{{ formatNumber(node.reserved.count) }}</td>
                        <td class="px-3 py-2 font-mono">{{ formatNumber(node.reserved.cpu_cores) }}</td>
                        <td class="px-3 py-2 font-mono">{{ formatBytes(node.reserved.ram_bytes) }}</td>
                        <td class="px-3 py-2 font-mono">{{ formatBytes(node.reserved.disk_bytes) }}</td>
                        <td class="px-3 py-2">
                          <div>{{ formatNumber(node.demand_groups) }} groups observed</div>
                          <Badge v-if="node.demand_truncated" variant="warn" class="mt-1">demand truncated</Badge>
                        </td>
                        <td class="px-3 py-2">
                          <div class="flex flex-wrap gap-1">
                            <Badge v-if="node.compute_draining" variant="warn">compute draining</Badge>
                            <Badge v-else variant="success">accepting compute</Badge>
                            <Badge v-if="node.leaving" variant="destructive">leaving</Badge>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <EmptyState v-else title="No node snapshots" description="This responder has not replicated any compute advertisements yet." />

                <div class="rounded-lg border border-border p-4">
                  <div class="flex flex-wrap items-end gap-2">
                    <div class="min-w-56 flex-1">
                      <label class="text-xs font-medium text-foreground">Optional group-demand lookup</label>
                      <Select v-model="snapshotGroupId" :options="groupOptions" placeholder="Select group" class="mt-1 max-w-sm" aria-label="Group demand lookup" />
                    </div>
                    <Button variant="outline" size="sm" :disabled="snapshotLoading" @click="loadSnapshots">Look up demand</Button>
                    <Button v-if="snapshotGroupId" variant="ghost" size="sm" :disabled="snapshotLoading" @click="clearSnapshotGroup">Clear</Button>
                  </div>

                  <div v-if="snapshots.group" class="mt-4">
                    <div class="mb-3 flex flex-wrap items-center gap-2">
                      <h4 class="text-xs font-semibold text-foreground">{{ groupName(snapshots.group.group_id) }}</h4>
                      <Badge v-if="snapshots.group.truncated" variant="warn">group demand truncated</Badge>
                      <Badge v-else variant="outline">replicated logical demand</Badge>
                    </div>
                    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <StatCard label="Jobs" :value="formatNumber(snapshots.group.demand.count)" :hint="`Quota ${quotaValue(snapshots.group.quota.max_jobs)}`" />
                      <StatCard label="CPU cores" :value="formatNumber(snapshots.group.demand.cpu_cores)" :hint="`Quota ${quotaValue(snapshots.group.quota.max_cpu_cores)}`" />
                      <StatCard label="RAM" :value="formatBytes(snapshots.group.demand.ram_bytes)" :hint="`Quota ${quotaValue(snapshots.group.quota.max_ram_bytes, 'bytes')}`" />
                      <StatCard label="Disk" :value="formatBytes(snapshots.group.demand.disk_bytes)" :hint="`Quota ${quotaValue(snapshots.group.quota.max_disk_bytes, 'bytes')}`" />
                    </div>
                    <p class="mt-3 text-[11px] text-muted-foreground">
                      Per-job ceilings: {{ quotaValue(snapshots.group.quota.max_job_cpu_cores) }} CPU,
                      {{ quotaValue(snapshots.group.quota.max_job_ram_bytes, 'bytes') }} RAM,
                      {{ quotaValue(snapshots.group.quota.max_job_disk_bytes, 'bytes') }} disk,
                      {{ quotaValue(snapshots.group.quota.max_job_walltime_ms, 'duration') }} walltime.
                    </p>
                  </div>
                  <p v-else class="mt-3 text-xs text-muted-foreground">Select a group to compare logical demand with its effective quota.</p>
                </div>

                <div v-if="snapshots.departure" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-3 text-xs text-amber-800 dark:text-amber-300">
                  <div class="flex flex-wrap items-center gap-2 font-medium">
                    This node has a departure report with {{ snapshots.departure.unresolved.length }} unresolved executions.
                    <Badge v-if="snapshots.departure.truncated" variant="warn">list truncated</Badge>
                  </div>
                  <p class="mt-1">Membership generation {{ snapshots.departure.membership_generation }}. Unresolved never means finished.</p>
                </div>
              </template>
              <div v-else-if="snapshotLoading" class="space-y-2"><Skeleton class="h-20" /><Skeleton class="h-20" /></div>
            </div>
          </section>

          <section id="compute-drain" class="surface scroll-mt-24">
            <header class="flex items-center gap-2 border-b border-border px-5 py-4">
              <ServerCog class="h-4 w-4 text-primary" />
              <h3 class="font-display text-sm font-semibold text-aruna-navy">This node's compute drain</h3>
            </header>
            <div class="space-y-3 p-5">
              <label class="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                <Switch :checked="snapshots?.operator_draining ?? false" :disabled="drainBusy || !snapshots" aria-label="Drain this node's compute plane" @update:checked="setDrain" />
                {{ snapshots?.operator_draining ? 'Draining' : 'Accepting new compute work' }}
              </label>
              <p class="text-[11px] text-muted-foreground">
                Draining stops new selections and launch offers. Admitted, queued, preparing, and running work is unaffected; returning requires an explicit undrain.
              </p>
              <p v-if="drainError" class="text-xs text-destructive">{{ drainError }}</p>
              <p v-else-if="drainMessage" class="text-xs text-emerald-700 dark:text-emerald-300">{{ drainMessage }}</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>
