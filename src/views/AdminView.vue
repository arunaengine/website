<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import StatCard from '@/components/ui/StatCard.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import PlacementAdminPanel from '@/components/placement/PlacementAdminPanel.vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { featureEnabled } from '@/lib/config'
import { storedReferencedHint } from '@/lib/quota'
import { formatBytes, formatNumber } from '@/lib/utils'
import { ApiError, type RealmQuotaConfig, type UserSearchHit } from '@/lib/api'
import { useDebounceFn } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { Database, HardDrive, Layers, Link2, Boxes, RefreshCw, Save, Plus, Trash2, ShieldCheck, Users, UserCog } from '@lucide/vue'

const { realmInfo, usageInfo, isRealmAdmin, canInspectUsers, isManagementNode, nodeInfo, setRealmQuota, saving, myGroups, discoverableGroups, searchUsers, refresh } = useAruna()
const { isAuthenticated } = useAuth()

const nodeCapability = computed(() => nodeInfo.value?.node.capabilities ?? 'server')

// Placement admin is a tab of this view (config-gated); the legacy
// /app/admin/placement route redirects here with ?tab=placement.
const placementAdminEnabled = featureEnabled('placementAdmin')

const route = useRoute()
const router = useRouter()
type AdminTab = 'realm' | 'placement'
const tab = computed<AdminTab>(() =>
  route.query.tab === 'placement' && placementAdminEnabled ? 'placement' : 'realm',
)
function setTab(next: AdminTab) {
  void router.replace({ query: { ...route.query, tab: next === 'realm' ? undefined : next } })
}

// Mirrors aruna's `impl Default for QuotaConfig` — the effective policy when a
// backend serves no quota block. null = unlimited.
const DEFAULT_QUOTA: RealmQuotaConfig = {
  default_group_quota_bytes: null,
  grace_factor_percent: 110,
  warn_threshold_percent: 85,
  group_overrides: [],
  max_groups_per_user: 3,
  user_group_cap_overrides: [],
  max_devices_per_user: null,
}

const UNITS = [
  { value: 'TiB', factor: 1024 ** 4 },
  { value: 'GiB', factor: 1024 ** 3 },
  { value: 'MiB', factor: 1024 ** 2 },
  { value: 'KiB', factor: 1024 },
  { value: 'B', factor: 1 },
]
const unitOptions = UNITS.map((u) => ({ value: u.value, label: u.value }))
const U32_MAX = 4294967295

// type="number" inputs emit numbers; normalize before any string handling.
function text(v: unknown): string {
  return v == null ? '' : String(v)
}

interface QuotaField {
  unlimited: boolean
  value: string | number
  unit: string
}
interface OverrideRow {
  group_id: string
  quota: QuotaField
  grace: string | number
}
interface UserCapRow {
  user_id: string
  name: string
  max_groups: string | number
}
interface Draft {
  defaultQuota: QuotaField
  grace: string | number
  warn: string | number
  maxGroups: string | number
  maxDevices: string | number
  overrides: OverrideRow[]
  userCaps: UserCapRow[]
}

// B always divides cleanly, so the seed is exact and round-trips byte-identical.
function bytesToAmount(bytes: number): { value: string; unit: string } {
  const unit = UNITS.find((u) => bytes % u.factor === 0) ?? { value: 'B', factor: 1 }
  return { value: String(bytes / unit.factor), unit: unit.value }
}
function amountToBytes(value: string | number, unit: string): number | null {
  const s = text(value).trim()
  const n = Number(s)
  if (s === '' || !Number.isFinite(n) || n < 0) return null
  const factor = UNITS.find((u) => u.value === unit)?.factor ?? 1024 ** 3
  const bytes = Math.round(n * factor)
  return Number.isSafeInteger(bytes) ? bytes : null
}
function fieldBytes(f: QuotaField): number | null {
  return f.unlimited ? null : amountToBytes(f.value, f.unit)
}
function seedField(bytes: number | null): QuotaField {
  if (bytes == null) return { unlimited: true, value: '', unit: 'GiB' }
  const { value, unit } = bytesToAmount(bytes)
  return { unlimited: false, value, unit }
}

function seedDraft(quota: RealmQuotaConfig | undefined, names: Map<string, string> = new Map()): Draft {
  const q = quota ?? DEFAULT_QUOTA
  return {
    defaultQuota: seedField(q.default_group_quota_bytes),
    grace: String(q.grace_factor_percent),
    warn: String(q.warn_threshold_percent),
    maxGroups: q.max_groups_per_user == null ? '' : String(q.max_groups_per_user),
    maxDevices: q.max_devices_per_user == null ? '' : String(q.max_devices_per_user),
    overrides: q.group_overrides.map((o) => ({
      group_id: o.group_id,
      quota: seedField(o.quota_bytes),
      grace: o.grace_factor_percent == null ? '' : String(o.grace_factor_percent),
    })),
    userCaps: q.user_group_cap_overrides.map((u) => ({
      user_id: u.user_id,
      name: names.get(u.user_id) ?? '',
      max_groups: u.max_groups == null ? '' : String(u.max_groups),
    })),
  }
}

const draft = ref<Draft>(seedDraft(realmInfo.value?.quota))
const baseline = ref(JSON.stringify(draft.value))
const dirty = computed(() => JSON.stringify(draft.value) !== baseline.value)
const saveError = ref<string | null>(null)
const saveMessage = ref<string | null>(null)

function reseed() {
  const names = new Map(draft.value.userCaps.filter((u) => u.name).map((u) => [u.user_id, u.name]))
  draft.value = seedDraft(realmInfo.value?.quota, names)
  baseline.value = JSON.stringify(draft.value)
}
// Re-seed from a refreshed realm config only while the admin has no edits open.
watch(() => realmInfo.value?.quota, () => { if (!dirty.value) reseed() })
watch(dirty, (d) => { if (d) { saveError.value = null; saveMessage.value = null } })

const groupOptions = computed(() => {
  const seen = new Map<string, string>()
  for (const g of [...myGroups.value, ...discoverableGroups.value]) if (!seen.has(g.id)) seen.set(g.id, g.name)
  return [...seen].map(([value, label]) => ({ value, label }))
})

function duplicates<T>(rows: T[], key: (row: T) => string): Set<string> {
  const seen = new Set<string>()
  const dup = new Set<string>()
  for (const row of rows) {
    const id = key(row)
    if (!id) continue
    if (seen.has(id)) dup.add(id)
    else seen.add(id)
  }
  return dup
}
const duplicateGroupIds = computed(() => duplicates(draft.value.overrides, (o) => o.group_id))
const duplicateUserIds = computed(() => duplicates(draft.value.userCaps, (u) => u.user_id))

function quotaFieldValid(f: QuotaField): boolean {
  return f.unlimited || amountToBytes(f.value, f.unit) != null
}
function intOrEmptyValid(v: string | number): boolean {
  const s = text(v).trim()
  if (s === '') return true
  const n = Number(s)
  return Number.isInteger(n) && n >= 0 && n <= U32_MAX
}
const graceInvalid = computed(() => { const g = Number(draft.value.grace); return !Number.isInteger(g) || g < 100 || g > U32_MAX })
const warnInvalid = computed(() => { const w = Number(draft.value.warn); return !Number.isInteger(w) || w < 1 || w > 100 })

const clientErrors = computed(() => {
  const errs: string[] = []
  if (graceInvalid.value) errs.push('Grace factor must be a whole number of at least 100%.')
  if (warnInvalid.value) errs.push('Warn threshold must be a whole number between 1 and 100%.')
  if (!quotaFieldValid(draft.value.defaultQuota)) errs.push('Default group quota must be a non-negative number below ~8 PiB.')
  if (!intOrEmptyValid(draft.value.maxGroups)) errs.push('Max groups per user must be a non-negative whole number.')
  if (!intOrEmptyValid(draft.value.maxDevices)) errs.push('Max devices per user must be a non-negative whole number.')
  draft.value.overrides.forEach((o, i) => {
    if (!o.group_id) errs.push(`Group override ${i + 1} needs a group.`)
    if (!quotaFieldValid(o.quota)) errs.push(`Group override ${i + 1} quota must be a non-negative number below ~8 PiB.`)
    if (!o.quota.unlimited && text(o.grace).trim() !== '') { const g = Number(o.grace); if (!Number.isInteger(g) || g < 100 || g > U32_MAX) errs.push(`Group override ${i + 1} grace factor must be at least 100%.`) }
  })
  if (duplicateGroupIds.value.size) errs.push('Each group may appear in at most one override.')
  draft.value.userCaps.forEach((u, i) => { if (!intOrEmptyValid(u.max_groups)) errs.push(`User cap ${i + 1} max groups must be a non-negative whole number.`) })
  if (duplicateUserIds.value.size) errs.push('Each user may appear in at most one cap override.')
  return errs
})
const invalid = computed(() => clientErrors.value.length > 0)

function addOverride() {
  draft.value.overrides.push({ group_id: '', quota: { unlimited: false, value: '', unit: 'GiB' }, grace: '' })
}
// Unlimited now exempts a group entirely; grace on an unlimited row is incoherent
// and rejected by the backend, so drop any stale grace when the toggle turns on.
function setOverrideUnlimited(o: OverrideRow, unlimited: boolean) {
  o.quota.unlimited = unlimited
  if (unlimited) o.grace = ''
}
function removeOverride(index: number) {
  draft.value.overrides.splice(index, 1)
}
function removeUserCap(index: number) {
  draft.value.userCaps.splice(index, 1)
}

const userQuery = ref('')
const userResults = ref<UserSearchHit[]>([])
const userSearching = ref(false)
const userSearchError = ref<string | null>(null)
const visibleUsers = computed(() => {
  const taken = new Set(draft.value.userCaps.map((u) => u.user_id))
  return userResults.value.filter((hit) => !taken.has(hit.user_id))
})
let userSearchSeq = 0
const runUserSearch = useDebounceFn(async (term: string) => {
  const seq = ++userSearchSeq
  userSearching.value = true
  userSearchError.value = null
  try {
    const response = await searchUsers(term)
    if (seq === userSearchSeq) userResults.value = response.users
  } catch (err) {
    if (seq === userSearchSeq) {
      userSearchError.value = err instanceof Error ? err.message : String(err)
      userResults.value = []
    }
  } finally {
    if (seq === userSearchSeq) userSearching.value = false
  }
}, 250)
watch(userQuery, (term) => {
  const trimmed = term.trim()
  if (trimmed.length < 2) {
    userSearchSeq++
    userResults.value = []
    userSearching.value = false
    userSearchError.value = null
    return
  }
  void runUserSearch(trimmed)
})
function addUserCap(hit: UserSearchHit) {
  draft.value.userCaps.push({ user_id: hit.user_id, name: hit.name, max_groups: '' })
  userQuery.value = ''
  userResults.value = []
}

function buildConfig(): RealmQuotaConfig {
  return {
    default_group_quota_bytes: fieldBytes(draft.value.defaultQuota),
    grace_factor_percent: Number(draft.value.grace),
    warn_threshold_percent: Number(draft.value.warn),
    group_overrides: draft.value.overrides.map((o) => ({
      group_id: o.group_id,
      quota_bytes: fieldBytes(o.quota),
      grace_factor_percent: o.quota.unlimited || text(o.grace).trim() === '' ? null : Number(o.grace),
    })),
    max_groups_per_user: text(draft.value.maxGroups).trim() === '' ? null : Number(draft.value.maxGroups),
    user_group_cap_overrides: draft.value.userCaps.map((u) => ({
      user_id: u.user_id,
      max_groups: text(u.max_groups).trim() === '' ? null : Number(u.max_groups),
    })),
    max_devices_per_user: text(draft.value.maxDevices).trim() === '' ? null : Number(draft.value.maxDevices),
  }
}

function reset() {
  reseed()
  saveError.value = null
  saveMessage.value = null
}
async function save() {
  if (!dirty.value || saving.value || invalid.value || !isManagementNode.value) return
  saveError.value = null
  saveMessage.value = null
  try {
    await setRealmQuota(buildConfig())
    reseed()
    saveMessage.value = 'Quota policy saved.'
  } catch (err) {
    saveError.value = err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err)
  }
}
</script>

<template>
  <div>
    <PageHeader title="Realm administration" description="Realm-wide usage, quota policy and placement configuration.">
      <template #actions>
        <Button variant="outline" @click="refresh"><RefreshCw class="h-4 w-4" /> Refresh</Button>
      </template>
    </PageHeader>

    <div v-if="!isRealmAdmin" class="container py-8">
      <section class="surface mx-auto max-w-xl p-8 text-center">
        <ShieldCheck class="mx-auto h-8 w-8 text-muted-foreground/70" />
        <h2 class="mt-3 font-display text-base font-semibold text-aruna-navy">Realm admin access required</h2>
        <p class="mt-1.5 text-sm text-muted-foreground">
          {{ isAuthenticated ? 'Your account does not hold the realm admin role needed to view or edit the quota policy.' : 'Sign in with a realm admin account to view or edit the quota policy.' }}
        </p>
      </section>
    </div>

    <template v-else>
      <div v-if="placementAdminEnabled" class="container pt-6">
        <div class="flex items-center gap-1 border-b border-border" role="tablist" aria-label="Realm administration sections">
          <button
            v-for="entry in [
              { id: 'realm' as const, label: 'Quota & usage' },
              { id: 'placement' as const, label: 'Placement' },
            ]"
            :key="entry.id"
            type="button"
            role="tab"
            :aria-selected="tab === entry.id"
            :class="[
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === entry.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            ]"
            @click="setTab(entry.id)"
          >
            {{ entry.label }}
          </button>
        </div>
      </div>

      <PlacementAdminPanel v-if="tab === 'placement'" />

      <div v-else class="container grid gap-6 py-8 lg:grid-cols-[260px_1fr]">
      <nav class="flex flex-col gap-1 text-sm lg:sticky lg:top-20 lg:self-start">
        <a href="#usage" class="rounded-md px-3 py-2 font-medium text-primary bg-primary/5">Realm usage</a>
        <a href="#policy" class="rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground">Quota policy</a>
        <a href="#group-overrides" class="rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground">Group overrides</a>
        <a href="#user-overrides" class="rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground">User caps</a>
        <RouterLink v-if="canInspectUsers" :to="{ name: 'admin-users' }" class="mt-1 rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground">Users &rarr;</RouterLink>
      </nav>

      <div class="space-y-6">
        <section id="usage" class="surface">
          <header class="flex items-center gap-2 border-b border-border px-5 py-4">
            <HardDrive class="h-4 w-4 text-primary" />
            <h3 class="font-display text-sm font-semibold text-aruna-navy">Realm usage</h3>
          </header>
          <div v-if="usageInfo?.realm" class="grid gap-3.5 p-5 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Objects" :value="formatNumber(usageInfo.realm.objects)" :icon="Database" :hint="storedReferencedHint(usageInfo.realm)" />
            <StatCard label="Stored data" :value="formatBytes(usageInfo.realm.stored_bytes)" :icon="HardDrive" hint="Physical blob storage" />
            <StatCard label="Logical data" :value="formatBytes(usageInfo.realm.logical_bytes)" :icon="Layers" hint="Counts against quotas" />
            <StatCard label="Referenced data" :value="formatBytes(usageInfo.realm.referenced_bytes)" :icon="Link2" hint="Does not count against quotas" />
            <StatCard label="Buckets" :value="formatNumber(usageInfo.realm.buckets)" :icon="Boxes" />
          </div>
          <p v-else class="px-5 py-4 text-sm text-muted-foreground">Realm-wide totals need an authenticated session on a quota-aware backend.</p>
        </section>

        <p v-if="!isManagementNode" class="surface px-5 py-3 text-xs text-muted-foreground">
          This node is a {{ nodeCapability }} node, the quota policy can only be edited through a management node.
        </p>

        <section id="policy" class="surface">
          <header class="flex items-center gap-2 border-b border-border px-5 py-4">
            <ShieldCheck class="h-4 w-4 text-primary" />
            <h3 class="font-display text-sm font-semibold text-aruna-navy">Quota policy</h3>
          </header>
          <div class="space-y-5 p-5">
            <div>
              <label class="text-xs font-medium text-foreground">Default group quota</label>
              <div class="mt-1.5 flex flex-wrap items-center gap-2">
                <label class="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Switch v-model:checked="draft.defaultQuota.unlimited" /> Unlimited
                </label>
                <template v-if="!draft.defaultQuota.unlimited">
                  <Input v-model="draft.defaultQuota.value" type="number" min="0" placeholder="0" class="w-32" />
                  <Select v-model="draft.defaultQuota.unit" :options="unitOptions" class="w-24" />
                  <span class="text-[11px] text-muted-foreground">= {{ formatBytes(fieldBytes(draft.defaultQuota) ?? 0) }}</span>
                </template>
              </div>
              <p class="mt-1 text-[11px] text-muted-foreground">Applies to every group without an override. Unlimited disables byte enforcement.</p>
            </div>
            <div class="grid gap-5 md:grid-cols-2">
              <div>
                <label class="text-xs font-medium text-foreground">Grace factor (%)</label>
                <Input v-model="draft.grace" type="number" min="100" class="mt-1" :invalid="graceInvalid ? 'error' : undefined" />
                <p class="mt-1 text-[11px] text-muted-foreground">Hard cap = quota × grace factor. Must be at least 100.</p>
              </div>
              <div>
                <label class="text-xs font-medium text-foreground">Warn threshold (%)</label>
                <Input v-model="draft.warn" type="number" min="1" max="100" class="mt-1" :invalid="warnInvalid ? 'error' : undefined" />
                <p class="mt-1 text-[11px] text-muted-foreground">Groups are flagged on their detail page at this share of the quota. 1–100.</p>
              </div>
              <div>
                <label class="text-xs font-medium text-foreground">Max groups per user</label>
                <Input v-model="draft.maxGroups" type="number" min="0" placeholder="Unlimited" class="mt-1" />
                <p class="mt-1 text-[11px] text-muted-foreground">Empty means unlimited.</p>
              </div>
              <div>
                <label class="text-xs font-medium text-foreground">Max devices per user</label>
                <Input v-model="draft.maxDevices" type="number" min="0" placeholder="Unlimited" class="mt-1" />
                <p class="mt-1 text-[11px] text-muted-foreground">Stored in the policy; not enforced yet, device enrollment is still in development.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="group-overrides" class="surface">
          <header class="flex items-center justify-between border-b border-border px-5 py-4">
            <div class="flex items-center gap-2"><Users class="h-4 w-4 text-primary" /><h3 class="font-display text-sm font-semibold text-aruna-navy">Group overrides</h3></div>
            <Button size="sm" variant="outline" @click="addOverride"><Plus class="h-3.5 w-3.5" /> Add override</Button>
          </header>
          <div class="space-y-3 p-5">
            <div v-for="(o, i) in draft.overrides" :key="i" class="rounded-lg border border-border bg-background p-3">
              <div class="flex flex-wrap items-center gap-2">
                <Select v-model="o.group_id" :options="groupOptions" placeholder="Select group" class="w-56" :invalid="duplicateGroupIds.has(o.group_id) ? 'error' : undefined" />
                <label class="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Switch :checked="o.quota.unlimited" @update:checked="setOverrideUnlimited(o, $event)" /> Unlimited
                </label>
                <template v-if="!o.quota.unlimited">
                  <Input v-model="o.quota.value" type="number" min="0" placeholder="0" class="w-28" />
                  <Select v-model="o.quota.unit" :options="unitOptions" class="w-24" />
                </template>
                <Input v-model="o.grace" type="number" min="100" placeholder="grace %" class="w-28" :disabled="o.quota.unlimited" />
                <Button variant="ghost" size="sm" class="ml-auto text-destructive hover:text-destructive" @click="removeOverride(i)"><Trash2 class="h-3.5 w-3.5" /></Button>
              </div>
              <div class="mt-1.5 text-[11px] text-muted-foreground">
                <template v-if="o.quota.unlimited">Unlimited, exempts this group from byte quotas entirely.</template>
                <template v-else>
                  <span v-if="quotaFieldValid(o.quota)">Quota {{ formatBytes(fieldBytes(o.quota) ?? 0) }}</span>
                  · Grace {{ text(o.grace).trim() === '' ? 'inherits the global factor' : `${o.grace}%` }}
                </template>
              </div>
            </div>
            <p v-if="!draft.overrides.length" class="text-xs text-muted-foreground">No per-group overrides. Every group uses the default quota.</p>
          </div>
        </section>

        <section id="user-overrides" class="surface">
          <header class="flex items-center gap-2 border-b border-border px-5 py-4">
            <UserCog class="h-4 w-4 text-primary" />
            <h3 class="font-display text-sm font-semibold text-aruna-navy">User group-cap overrides</h3>
          </header>
          <div class="space-y-3 p-5">
            <div v-for="(u, i) in draft.userCaps" :key="u.user_id" class="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background p-3">
              <div class="min-w-0">
                <div class="truncate text-sm font-medium text-foreground">{{ u.name || u.user_id }}</div>
                <div class="truncate font-mono text-[10px] text-muted-foreground">{{ u.user_id.slice(0, 12) }}</div>
              </div>
              <div class="ml-auto flex items-center gap-2">
                <Input v-model="u.max_groups" type="number" min="0" placeholder="Unlimited" class="w-32" />
                <Button variant="ghost" size="sm" class="text-destructive hover:text-destructive" @click="removeUserCap(i)"><Trash2 class="h-3.5 w-3.5" /></Button>
              </div>
            </div>
            <p v-if="!draft.userCaps.length" class="text-xs text-muted-foreground">No per-user overrides. The global maximum applies to everyone.</p>
            <div class="relative max-w-md">
              <Input v-model="userQuery" placeholder="Search users to add (min 2 characters)" />
              <div v-if="userQuery.trim().length >= 2" class="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-md">
                <div v-if="userSearching" class="px-3 py-2 text-xs text-muted-foreground">Searching…</div>
                <div v-else-if="userSearchError" class="px-3 py-2 text-xs text-destructive">{{ userSearchError }}</div>
                <div v-else-if="!visibleUsers.length" class="px-3 py-2 text-xs text-muted-foreground">No matching users.</div>
                <button
                  v-for="hit in visibleUsers"
                  :key="hit.user_id"
                  type="button"
                  class="flex w-full items-baseline justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
                  @click="addUserCap(hit)"
                >
                  <span class="truncate text-foreground">{{ hit.name }}</span>
                  <span class="shrink-0 font-mono text-[10px] text-muted-foreground">{{ hit.user_id.slice(0, 8) }}</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <div class="surface sticky bottom-4 flex flex-wrap items-center justify-between gap-3 px-5 py-3 shadow-lg">
          <div class="min-w-0 text-xs">
            <span v-if="saveError" class="text-destructive">{{ saveError }}</span>
            <span v-else-if="invalid" class="text-destructive">{{ clientErrors[0] }}</span>
            <span v-else-if="saveMessage" class="text-emerald-700 dark:text-emerald-300">{{ saveMessage }}</span>
            <span v-else-if="dirty" class="text-muted-foreground">Unsaved changes, replaces the entire realm quota policy.</span>
            <span v-else class="text-muted-foreground">All changes saved.</span>
          </div>
          <div class="flex items-center gap-2">
            <Button variant="outline" size="sm" :disabled="!dirty || saving" @click="reset">Reset</Button>
            <Button size="sm" :disabled="!dirty || saving || invalid || !isManagementNode" @click="save"><Save class="h-3.5 w-3.5" /> Save policy</Button>
          </div>
        </div>
      </div>
      </div>
    </template>
  </div>
</template>
