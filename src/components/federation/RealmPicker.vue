<script setup lang="ts">
// The one realm picker: the header uses it to open another realm, the login page and the
// import use it to choose one. Every realm is checked from both of its descriptor routes
// before it is opened, chosen or saved.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { colorFor, shortId } from '@/composables/aruna/format'
import { portalConfig } from '@/lib/config'
import type { VerifiedRealm } from '@/lib/federation/descriptor'
import {
  checkRealm,
  listRegistry,
  matchesQuery,
  savedRealms,
  setRealmSaved,
  type RealmCheck,
  type RegistryRealm,
} from '@/lib/federation/realms'
import { errorMessage, relativeTime } from '@/lib/utils'
import { ChevronRight, Plus, RefreshCw, Search, ShieldCheck, ShieldQuestion, Star } from '@lucide/vue'

// `checkPick: false` hands a chosen realm on at the click, so a popup can open at once; the
// consumer then checks the realm itself before it uses it.
const props = withDefaults(defineProps<{ actionLabel?: string; excludeRealmId?: string; checkPick?: boolean }>(), {
  actionLabel: 'Open',
  excludeRealmId: '',
  checkPick: true,
})
const emit = defineEmits<{ (e: 'pick', realm: VerifiedRealm): void }>()

const query = ref('')
const registryUrl = portalConfig().registryUrl
const registry = ref<RegistryRealm[] | null>(null)
const registryError = ref<string | null>(null)
const advancedOpen = ref(false)
const address = ref('')
const busyKey = ref('')
const problem = ref<(Exclude<RealmCheck, { status: 'ok' }> & { retry?: () => void }) | null>(null)
let generation = 0
const registryAbort = new AbortController()

const registryRows = computed(() =>
  (registry.value ?? []).filter(
    (entry) => entry.realm.realmId !== props.excludeRealmId && matchesQuery(entry.realm, query.value),
  ),
)
const savedRows = computed(() =>
  savedRealms.value.filter((realm) => realm.realmId !== props.excludeRealmId && matchesQuery(realm, query.value)),
)
const savedIds = computed(() => new Set(savedRealms.value.map((realm) => realm.realmId)))

onMounted(async () => {
  if (!registryUrl) return
  try {
    registry.value = await listRegistry(registryUrl, registryAbort.signal)
  } catch (error) {
    if (!registryAbort.signal.aborted) registryError.value = errorMessage(error)
  }
})
onBeforeUnmount(() => {
  generation++
  registryAbort.abort()
})

function count(value: number | null, one: string, many: string) {
  if (value === null || value === undefined) return `${many[0].toUpperCase()}${many.slice(1)} unknown`
  return `${value} ${value === 1 ? one : many}`
}

function registryMeta(entry: RegistryRealm) {
  return [
    shortId(entry.realm.realmId),
    count(entry.kpis.live_datasets, 'dataset', 'datasets'),
    count(entry.kpis.groups, 'group', 'groups'),
    count(entry.kpis.nodes_configured, 'node', 'nodes'),
    `updated ${relativeTime(new Date(entry.observedAt * 1000).toISOString())}`,
  ].join(' · ')
}

function host(url: string) {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

async function run(key: string, task: () => Promise<RealmCheck>, onOk: (realm: VerifiedRealm) => void, retry: () => void) {
  const current = ++generation
  busyKey.value = key
  problem.value = null
  try {
    const result = await task()
    if (current !== generation) return
    if (result.status === 'ok') onOk(result.realm)
    else problem.value = { ...result, retry: result.status === 'unreachable' ? retry : undefined }
  } finally {
    if (current === generation) busyKey.value = ''
  }
}

function choose(realm: VerifiedRealm) {
  if (!props.checkPick) return emit('pick', realm)
  const check = () => checkRealm(realm.portalUrl, { realmId: realm.realmId, label: realm.name })
  void run(`pick:${realm.realmId}`, check, (checked) => emit('pick', checked), () => choose(realm))
}

function toggleStar(realm: VerifiedRealm) {
  if (savedIds.value.has(realm.realmId)) {
    setRealmSaved(realm.realmId, false)
    return
  }
  const check = () => checkRealm(realm.portalUrl, { realmId: realm.realmId, save: true, label: realm.name })
  void run(`star:${realm.realmId}`, check, () => undefined, () => toggleStar(realm))
}

function addAddress() {
  const value = address.value.trim()
  if (!value) return
  void run('address', () => checkRealm(value, { save: true }), () => (address.value = ''), addAddress)
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-1">
    <div class="relative px-1 pb-1">
      <label for="realm-picker-query" class="sr-only">Search realms</label>
      <Search class="pointer-events-none absolute left-3.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
      <Input id="realm-picker-query" v-model="query" placeholder="Search realms" class="pl-9" />
    </div>

    <template v-if="registryUrl">
      <p class="px-2.5 pt-2 text-[11px] font-semibold text-muted-foreground">From the registry</p>
      <p v-if="registryError" class="px-2.5 pb-2 text-xs text-muted-foreground">The registry is not reachable.</p>
      <Spinner v-else-if="!registry" show-label label="Loading realms…" class="px-2.5 py-2 text-xs" />
      <p v-else-if="!registryRows.length" class="px-2.5 pb-2 text-xs text-muted-foreground">No realms found.</p>
      <div v-for="entry in registryRows" :key="`registry:${entry.realm.realmId}`" class="flex items-start gap-3 rounded-md px-2.5 py-2 hover:bg-muted/60">
        <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full" :style="{ backgroundColor: colorFor(entry.realm.realmId) }" aria-hidden="true" />
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-medium text-foreground">{{ entry.realm.name }}</span>
            <Badge v-if="entry.verified" variant="success" size="sm" class="gap-1"><ShieldCheck class="h-3 w-3" /> Verified</Badge>
            <Badge v-else variant="secondary" size="sm" class="gap-1"><ShieldQuestion class="h-3 w-3" /> Not verified</Badge>
          </div>
          <p v-if="entry.realm.description" class="mt-0.5 text-xs text-foreground/80">{{ entry.realm.description }}</p>
          <p class="mt-0.5 text-[11px] text-muted-foreground">{{ registryMeta(entry) }}</p>
          <p v-if="!entry.verified" class="mt-0.5 text-[11px] text-muted-foreground">The registry could not reach this realm.</p>
          <p v-else-if="entry.stale" class="mt-0.5 text-[11px] text-amber-700 dark:text-amber-300">Counts may be out of date.</p>
        </div>
        <button
          type="button"
          class="mt-1 text-muted-foreground transition-colors hover:text-foreground"
          :class="savedIds.has(entry.realm.realmId) && 'text-amber-500 hover:text-amber-600'"
          :aria-label="savedIds.has(entry.realm.realmId) ? `Remove ${entry.realm.name} from saved realms` : `Save ${entry.realm.name}`"
          :aria-pressed="savedIds.has(entry.realm.realmId)"
          :disabled="Boolean(busyKey)"
          @click="toggleStar(entry.realm)"
        >
          <Star class="h-4 w-4" :class="savedIds.has(entry.realm.realmId) && 'fill-current'" />
        </button>
        <Button size="sm" variant="outline" :disabled="Boolean(busyKey)" @click="choose(entry.realm)">
          <Spinner v-if="busyKey === `pick:${entry.realm.realmId}`" class="text-current" aria-hidden="true" />
          {{ actionLabel }}
        </Button>
      </div>
      <div class="my-1 h-px bg-border" />
    </template>

    <p class="px-2.5 pt-2 text-[11px] font-semibold text-muted-foreground">Saved realms</p>
    <p v-if="!savedRealms.length" class="flex items-center gap-1.5 px-2.5 pb-2 text-xs text-muted-foreground">
      <Star class="h-3.5 w-3.5" aria-hidden="true" /> Star a realm to keep it here.
    </p>
    <p v-else-if="!savedRows.length" class="px-2.5 pb-2 text-xs text-muted-foreground">No saved realm matches.</p>
    <div v-for="realm in savedRows" :key="`saved:${realm.realmId}`" class="flex items-start gap-3 rounded-md px-2.5 py-2 hover:bg-muted/60">
      <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full" :style="{ backgroundColor: colorFor(realm.realmId) }" aria-hidden="true" />
      <div class="min-w-0 flex-1">
        <span class="text-sm font-medium text-foreground">{{ realm.name }}</span>
        <p class="mt-0.5 text-[11px] text-muted-foreground">
          <span class="font-mono">{{ shortId(realm.realmId) }}</span> · {{ host(realm.portalUrl) }}
        </p>
      </div>
      <button
        type="button"
        class="mt-1 text-amber-500 transition-colors hover:text-amber-600"
        :aria-label="`Remove ${realm.name} from saved realms`"
        aria-pressed="true"
        @click="toggleStar(realm)"
      >
        <Star class="h-4 w-4 fill-current" />
      </button>
      <Button size="sm" variant="outline" :disabled="Boolean(busyKey)" @click="choose(realm)">
        <Spinner v-if="busyKey === `pick:${realm.realmId}`" class="text-current" aria-hidden="true" />
        {{ actionLabel }}
      </Button>
    </div>

    <Notice v-if="problem" :tone="problem.status === 'mismatch' ? 'error' : problem.status === 'older' ? 'info' : 'warning'" class="mx-1 flex items-center justify-between gap-3">
      <span>{{ problem.message }}<template v-if="problem.status === 'mismatch'"> Opening and saving are off.</template></span>
      <Button v-if="problem.retry" size="sm" variant="outline" @click="problem.retry()">
        <RefreshCw class="h-3.5 w-3.5" /> Try again
      </Button>
    </Notice>

    <div class="my-1 h-px bg-border" />
    <button
      type="button"
      class="flex w-full items-center gap-1.5 rounded-md px-2.5 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      :aria-expanded="advancedOpen"
      @click="advancedOpen = !advancedOpen"
    >
      <ChevronRight :class="['h-3.5 w-3.5 transition-transform', advancedOpen && 'rotate-90']" /> Advanced
    </button>
    <form v-if="advancedOpen" class="px-2.5 pb-2" @submit.prevent="addAddress">
      <label for="realm-picker-address" class="text-xs font-medium text-foreground">Realm address</label>
      <div class="mt-1.5 flex gap-2">
        <Input id="realm-picker-address" v-model="address" placeholder="https://realm.example.org" />
        <Button type="submit" variant="outline" :disabled="!address.trim() || Boolean(busyKey)">
          <Spinner v-if="busyKey === 'address'" class="text-current" aria-hidden="true" />
          <Plus v-else class="h-4 w-4" /> Add and save
        </Button>
      </div>
    </form>
  </div>
</template>
