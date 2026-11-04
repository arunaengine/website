<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import OverviewCell from '@/components/dashboard/OverviewCell.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import Button from '@/components/ui/Button.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import InfoHint from '@/components/ui/InfoHint.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ComputeAdminPanel from '@/components/compute-admin/ComputeAdminPanel.vue'
import AdminGroupsPanel from '@/components/groups/AdminGroupsPanel.vue'
import JobsPanel from '@/components/jobs/JobsPanel.vue'
import PlacementAdminPanel from '@/components/placement/PlacementAdminPanel.vue'
import DataPlacementPanel from '@/components/storage/DataPlacementPanel.vue'
import PoliciesSection from '@/components/policies/PoliciesSection.vue'
import FederationSettings from '@/components/federation/FederationSettings.vue'
import FeatureDefaults from '@/components/settings/FeatureDefaults.vue'
import RealmAssistant from '@/components/settings/RealmAssistant.vue'
import EffectivePolicies from '@/components/policies/EffectivePolicies.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import { useRouteTab } from '@/composables/useRouteTab'
import { adminTabs } from '@/views/adminTabs'
import { RouterLink, useRouter } from 'vue-router'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { useRefresh } from '@/composables/useRefresh'
import { useUserDirectory } from '@/composables/useUserDirectory'
import { featureEnabled } from '@/lib/config'
import { errorMessage, formatBytes, formatNumber, shortUserId } from '@/lib/utils'
import { countText, useRealmBucketCount } from '@/composables/useBucketCount'
import { apiErrorMessage, type UserSearchHit } from '@/lib/api'
import {
  UNITS, amountToBytes, buildConfig, fieldBytes, seedDraft, text,
  type Draft, type OverrideRow, type QuotaField, type UserCapRow,
} from '@/views/adminQuota'
import { useDebounceFn } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { ChevronDown, Cpu, Sparkles, Database, Files, Gauge, Globe, HardDrive, Layers, Link2, ListTodo, Boxes, MapPinned, Server, Save, Plus, ServerCog, ShieldAlert, Trash2, ShieldCheck, SlidersHorizontal, Users, UserCog, Workflow } from '@lucide/vue'

const router = useRouter()
const realmNodeCount = computed(() => (realmInfo.value?.nodes ?? []).filter((node) => node.kind !== 'user').length)
const { realmInfo, usageInfo, isRealmAdmin, canInspectUsers, canManageOnboarding, canManageQuarantine, setRealmQuota, saving, myGroups, discoverableGroups, searchUsers, refresh } = useAruna()
const realmBuckets = useRealmBucketCount(computed(() => usageInfo.value?.realm))
const { isAuthenticated, authPending } = useAuth()
// Shared realm directory: resolves saved user-cap ids to display names so rows
// show a handle instead of the raw {ulid}@{realm} identity.
const { resolveUsers, cachedUser } = useUserDirectory()

const { busy: refreshBusy, refresh: onRefresh } = useRefresh(refresh)

// Record placement and data placement are tabs of this view (config-gated);
// the legacy /app/admin/placement route redirects here with ?tab=placement.
const placementAdminEnabled = featureEnabled('placementAdmin')
const policiesEnabled = featureEnabled('policies')

const tabs = adminTabs({ placement: placementAdminEnabled, policies: policiesEnabled, jobs: featureEnabled('jobs') })
const TAB_ICONS: Record<string, unknown> = {
  realm: Gauge,
  groups: Users,
  compute: Cpu,
  assistant: Sparkles,
  jobs: ListTodo,
  placement: Workflow,
  'data-placement': MapPinned,
  policies: ShieldAlert,
  federation: Globe,
  'portal-features': SlidersHorizontal,
}
const tab = useRouteTab(
  tabs.map((entry) => entry.id),
  'realm',
)

const unitOptions = UNITS.map((u) => ({ value: u.value, label: u.value }))
const U32_MAX = 4294967295

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

// Saved overrides carry only ids; hydrate names through the shared directory so
// each row can show a handle. Rows re-render as the reactive cache fills in.
watch(
  () => draft.value.userCaps.map((u) => u.user_id),
  (ids) => { if (ids.length) void resolveUsers(ids) },
  { immediate: true },
)
// Handle first, raw {ulid}@{realm} identity kept in the row title and copyable
// elsewhere. Falls back to a short ULID form when no name is known.
function capName(u: UserCapRow): string {
  return u.name || cachedUser(u.user_id)?.name || shortUserId(u.user_id)
}
function capHasName(u: UserCapRow): boolean {
  return !!(u.name || cachedUser(u.user_id)?.name)
}
// Human-readable meaning of the per-user cap value (unit: group memberships).
function maxGroupsPreview(value: string | number): string {
  const s = text(value).trim()
  if (s === '') return 'Unlimited group memberships (overrides the realm maximum).'
  const n = Number(s)
  if (!Number.isInteger(n) || n < 0) return 'Enter a whole number of groups, or leave empty for unlimited.'
  return `May join up to ${n} ${n === 1 ? 'group' : 'groups'} (overrides the realm maximum).`
}

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
  // The backend refuses zero rather than reading it as "no devices at all".
  if (!intOrEmptyValid(draft.value.maxDevices) || Number(text(draft.value.maxDevices).trim() || 1) < 1)
    errs.push('Max devices per user must be empty or a whole number of at least 1.')
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
  draft.value.overrides.push({ group_id: '', quota: { unlimited: false, value: '', unit: 'GiB' }, grace: '', count_replicas: null })
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
      userSearchError.value = errorMessage(err)
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

function reset() {
  reseed()
  saveError.value = null
  saveMessage.value = null
}
async function save() {
  if (!dirty.value || saving.value || invalid.value) return
  saveError.value = null
  saveMessage.value = null
  try {
    await setRealmQuota(buildConfig(draft.value))
    reseed()
    saveMessage.value = 'Quota policy saved.'
  } catch (err) {
    saveError.value = apiErrorMessage(err)
  }
}
</script>

<template>
  <div>
    <PageHeader title="Realm administration" :docs="{ topic: 'data-to-compute', section: 'Placement policies and record placement' }">
      <template #actions>
        <RefreshButton :busy="refreshBusy" @click="onRefresh" />
        <!-- The other admin pages in one menu, so the header keeps few controls. -->
        <DropdownMenu v-if="isRealmAdmin && (canInspectUsers || canManageOnboarding || canManageQuarantine)">
          <DropdownMenuTrigger as-child>
            <Button size="sm" variant="outline"><ShieldCheck class="h-4 w-4" /> Admin pages <ChevronDown class="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-56 p-1.5">
            <DropdownMenuItem v-if="isRealmAdmin && canInspectUsers" class="cursor-pointer" @click="router.push({ name: 'admin-users' })"><Users class="h-4 w-4" /> Users</DropdownMenuItem>
            <DropdownMenuItem v-if="isRealmAdmin && canManageOnboarding" class="cursor-pointer" @click="router.push({ name: 'admin-onboarding' })"><ServerCog class="h-4 w-4" /> Node onboarding</DropdownMenuItem>
            <DropdownMenuItem v-if="isRealmAdmin && canManageQuarantine" class="cursor-pointer" @click="router.push({ name: 'admin-quarantine' })"><ShieldAlert class="h-4 w-4" /> Sync quarantine</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </template>
    </PageHeader>

    <!-- Session restore in flight: the admin role is unknown until the user
         profile resolves, never flash the access-required gate. -->
    <div v-if="authPending" class="w-full px-4 sm:px-6 py-8">
      <section class="surface mx-auto max-w-xl space-y-3 p-8">
        <Skeleton class="mx-auto h-8 w-8 rounded-full" />
        <Skeleton class="mx-auto h-4 w-44" />
        <Skeleton class="mx-auto h-3 w-64" />
      </section>
    </div>

    <div v-else-if="!isRealmAdmin" class="w-full px-4 sm:px-6 py-8">
      <section class="surface mx-auto max-w-xl p-8 text-center">
        <ShieldCheck class="mx-auto h-8 w-8 text-muted-foreground/70" />
        <h2 class="mt-3 font-display text-base font-semibold text-aruna-navy">Realm admin access required</h2>
        <p class="mt-1.5 text-sm text-muted-foreground">
          {{ isAuthenticated ? 'Your account does not hold WRITE permission on the realm administration configuration.' : 'Sign in with an account that can administer the realm configuration.' }}
        </p>
        <!-- Quarantine is its own grant, so it stays reachable without it. -->
        <Button v-if="canManageQuarantine" variant="outline" size="sm" class="mt-4" as-child>
          <RouterLink :to="{ name: 'admin-quarantine' }">Sync quarantine</RouterLink>
        </Button>
      </section>
    </div>

    <Tabs v-else v-model="tab">
      <div class="w-full px-4 sm:px-6 pt-6">
        <TabsList aria-label="Realm administration sections" class="h-auto flex-wrap justify-start">
          <TabsTrigger v-for="entry in tabs" :key="entry.id" :value="entry.id" class="gap-1.5">
            <component :is="TAB_ICONS[entry.id]" class="h-3.5 w-3.5" /> {{ entry.label }}
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="groups" class="mt-0 w-full px-4 py-6 sm:px-6"><AdminGroupsPanel /></TabsContent>

      <TabsContent value="compute" class="mt-0"><ComputeAdminPanel /></TabsContent>

      <TabsContent value="assistant" class="mt-0 w-full px-4 py-6 sm:px-6"><RealmAssistant /></TabsContent>

      <TabsContent v-if="tabs.some((entry) => entry.id === 'jobs')" value="jobs" class="mt-0 w-full px-4 py-6 sm:px-6"><JobsPanel in-place /></TabsContent>

      <TabsContent v-if="placementAdminEnabled" value="placement" class="mt-0"><PlacementAdminPanel /></TabsContent>

      <TabsContent v-if="placementAdminEnabled" value="data-placement" class="mt-0"><DataPlacementPanel /></TabsContent>

      <TabsContent v-if="policiesEnabled" value="policies" class="w-full px-4 sm:px-6 mt-0 space-y-8 py-8">
        <PoliciesSection scope="realm" :can-admin="isRealmAdmin" />
        <EffectivePolicies />
      </TabsContent>

      <TabsContent value="federation" class="w-full px-4 sm:px-6 mt-0 py-8"><FederationSettings /></TabsContent>

      <TabsContent value="portal-features" class="w-full px-4 sm:px-6 mt-0 py-8"><FeatureDefaults /></TabsContent>

      <TabsContent value="realm" class="w-full px-4 sm:px-6 mt-0 space-y-8 py-6">
        <section id="usage" class="scroll-mt-24" aria-labelledby="admin-usage-heading">
          <SectionHeading id="admin-usage-heading" title="Realm usage" :icon="Gauge" />
          <div v-if="usageInfo?.realm" class="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <OverviewCell label="Stored data" :icon="HardDrive" info="Physical blob storage on every node. The logical size of the data counts against quotas.">
              <template #value>{{ formatBytes(usageInfo.realm.stored_bytes ?? 0) }}</template>
              <span><Layers /><b>{{ formatBytes(usageInfo.realm.logical_bytes) }}</b> counted against quotas</span>
            </OverviewCell>
            <OverviewCell label="Referenced data" :icon="Link2" tone="aqua" info="Data that stays at its source.">
              <template #value>{{ formatBytes(usageInfo.realm.referenced_bytes) }}</template>
              <span><ShieldCheck />Not counted against quotas</span>
            </OverviewCell>
            <OverviewCell label="Objects" :icon="Files" tone="sky">
              <template #value>{{ formatNumber(usageInfo.realm.objects) }}</template>
              <span><Database /><b>{{ formatNumber(usageInfo.realm.stored_blobs ?? 0) }}</b> physical blob locations</span>
            </OverviewCell>
            <OverviewCell label="Buckets" :icon="Boxes" tone="ok" info="A bucket stored on several nodes counts once." :to="{ name: 'buckets' }">
              <template #value>{{ realmBuckets ? countText(realmBuckets, formatNumber) : formatNumber(usageInfo.realm.buckets) }}</template>
              <span v-if="realmNodeCount"><Server />Across <b>{{ formatNumber(realmNodeCount) }}</b> {{ realmNodeCount === 1 ? 'node' : 'nodes' }}</span>
            </OverviewCell>
          </div>
          <EmptyState v-else title="Realm totals need a signed-in session on a quota-aware node" />
        </section>

        <section id="policy" class="scroll-mt-24" aria-labelledby="admin-policy-heading">
          <SectionHeading id="admin-policy-heading" title="Quota policy" :icon="ShieldCheck" />
          <div class="surface space-y-5 p-5">
            <div>
              <label class="flex items-center gap-1.5 text-xs font-medium text-foreground">Default group quota<InfoHint label="Applies to every group without an override. Unlimited disables byte enforcement." /></label>
              <div class="mt-1.5 flex flex-wrap items-center gap-2">
                <label class="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Switch v-model:checked="draft.defaultQuota.unlimited" /> Unlimited
                </label>
                <template v-if="!draft.defaultQuota.unlimited">
                  <Input v-model="draft.defaultQuota.value" type="number" min="0" placeholder="0" class="w-32" />
                  <Select v-model="draft.defaultQuota.unit" :options="unitOptions" class="w-24" />
                  <span class="text-xs text-muted-foreground">= {{ formatBytes(fieldBytes(draft.defaultQuota) ?? 0) }}</span>
                </template>
              </div>
            </div>
            <div class="grid gap-5 md:grid-cols-2">
              <div>
                <label class="flex items-center gap-1.5 text-xs font-medium text-foreground">Grace factor (%)<InfoHint label="Hard cap = quota × grace factor. Must be at least 100." /></label>
                <Input v-model="draft.grace" type="number" min="100" class="mt-1" :invalid="graceInvalid ? 'error' : undefined" />
              </div>
              <div>
                <label class="flex items-center gap-1.5 text-xs font-medium text-foreground">Warn threshold (%)<InfoHint label="Groups are flagged on their detail page at this share of the quota. 1–100." /></label>
                <Input v-model="draft.warn" type="number" min="1" max="100" class="mt-1" :invalid="warnInvalid ? 'error' : undefined" />
              </div>
              <div>
                <label class="flex items-center gap-1.5 text-xs font-medium text-foreground">Max groups per user<InfoHint label="Empty means unlimited." /></label>
                <Input v-model="draft.maxGroups" type="number" min="0" placeholder="Unlimited" class="mt-1" />
              </div>
              <div>
                <label class="flex items-center gap-1.5 text-xs font-medium text-foreground">Max devices per user<InfoHint label="Empty means unlimited; zero is refused. Enrolled devices and outstanding enrollment codes both take a slot." /></label>
                <Input v-model="draft.maxDevices" type="number" min="1" placeholder="Unlimited" class="mt-1" />
              </div>
            </div>
          </div>
        </section>

        <section id="group-overrides" class="scroll-mt-24" aria-labelledby="admin-group-overrides-heading">
          <SectionHeading id="admin-group-overrides-heading" title="Group overrides" :icon="Users">
            <template #actions>
              <Button size="sm" variant="outline" @click="addOverride"><Plus class="h-3.5 w-3.5" /> Add override</Button>
            </template>
          </SectionHeading>
          <div class="surface space-y-3 p-5">
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
              <div class="mt-1.5 text-xs text-muted-foreground">
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

        <section id="user-overrides" class="scroll-mt-24" aria-labelledby="admin-user-caps-heading">
          <SectionHeading id="admin-user-caps-heading" title="User caps" :icon="UserCog" info="The most groups one user may create, above the realm default." />
          <div class="surface space-y-3 p-5">
            <div v-for="(u, i) in draft.userCaps" :key="u.user_id" class="rounded-lg border border-border bg-background p-3">
              <div class="flex flex-wrap items-center gap-2">
                <div class="min-w-0" :title="u.user_id">
                  <RouterLink :to="{ name: 'user', params: { id: u.user_id } }" class="block truncate text-sm font-medium text-foreground hover:underline">{{ capName(u) }}</RouterLink>
                  <div v-if="capHasName(u)" class="truncate font-mono text-xs text-muted-foreground">{{ shortUserId(u.user_id) }}</div>
                </div>
                <div class="ml-auto flex items-center gap-2">
                  <label :for="`user-cap-${i}`" class="text-xs font-medium text-muted-foreground">Max groups</label>
                  <Input :id="`user-cap-${i}`" v-model="u.max_groups" type="number" min="0" placeholder="Unlimited" class="w-24 text-right" />
                  <Button variant="ghost" size="sm" class="text-destructive hover:text-destructive" @click="removeUserCap(i)"><Trash2 class="h-3.5 w-3.5" /></Button>
                </div>
              </div>
              <p class="mt-1.5 text-xs text-muted-foreground">{{ maxGroupsPreview(u.max_groups) }}</p>
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
                  <span class="truncate text-foreground">{{ hit.name || shortUserId(hit.user_id) }}</span>
                  <span class="shrink-0 font-mono text-xs text-muted-foreground" :title="hit.user_id">{{ shortUserId(hit.user_id) }}</span>
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
            <Button size="sm" :disabled="!dirty || saving || invalid" @click="save"><Save class="h-3.5 w-3.5" /> Save policy</Button>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  </div>
</template>
