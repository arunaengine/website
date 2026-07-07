<script setup lang="ts">
import { computed, ref, toRaw, watch } from 'vue'
import { RouterLink } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import LocationAggregates from '@/components/placement/LocationAggregates.vue'
import StrategyEditor from '@/components/placement/StrategyEditor.vue'
import TransitionsTable from '@/components/placement/TransitionsTable.vue'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { isPlacementUnsupported, usePlacement } from '@/composables/usePlacement'
import { aggregateByLocation, knownLocations as computeKnownLocations } from '@/lib/placement'
import {
  ApiError,
  type PlacementStrategyConfig,
  type PlacementTransition,
  type RealmPlacementDefaultsResponse,
} from '@/lib/api'
import { ArrowLeftRight, MapPinned, RefreshCw, ShieldCheck, SlidersHorizontal } from '@lucide/vue'

const { bootstrapped, currentUser, isRealmAdmin, isManagementNode, realmInfo } = useAruna()
const { isAuthenticated } = useAuth()
const {
  placementAdminEnabled,
  busy,
  getRealmPlacementDefaults,
  putRealmPlacementDefaults,
  listPlacementTransitions,
} = usePlacement()

const locationAggregates = computed(() => aggregateByLocation(realmInfo.value?.nodes ?? []))
const knownLocations = computed(() => computeKnownLocations(realmInfo.value?.nodes ?? []))

// Content (and any HTTP) is only reachable once the session is bootstrapped, the
// flag is on, and the caller is a realm admin — the disabled/forbidden states
// never issue a request.
const ready = computed(
  () => bootstrapped.value && placementAdminEnabled.value && Boolean(currentUser.value) && isRealmAdmin.value,
)

const defaultsResp = ref<RealmPlacementDefaultsResponse | null>(null)
const defaultsDraft = ref<PlacementStrategyConfig | null>(null)
const defaultsLoading = ref(false)
const defaultsError = ref<string | null>(null)
const defaultsUnsupported = ref(false)
const saveError = ref<string | null>(null)
const saveMessage = ref<string | null>(null)

const defaultsDirty = computed(
  () =>
    Boolean(defaultsResp.value && defaultsDraft.value) &&
    JSON.stringify(defaultsDraft.value) !== JSON.stringify(defaultsResp.value?.default_strategy),
)

const transitions = ref<PlacementTransition[] | null>(null)
const transitionsLoading = ref(false)
const transitionsError = ref<string | null>(null)
const transitionsUnsupported = ref(false)

async function loadDefaults() {
  if (!placementAdminEnabled.value || !isRealmAdmin.value) return
  defaultsLoading.value = true
  defaultsError.value = null
  defaultsUnsupported.value = false
  saveError.value = null
  saveMessage.value = null
  try {
    const resp = await getRealmPlacementDefaults()
    defaultsResp.value = resp
    defaultsDraft.value = structuredClone(resp.default_strategy)
  } catch (err) {
    defaultsResp.value = null
    defaultsDraft.value = null
    if (isPlacementUnsupported(err)) defaultsUnsupported.value = true
    else defaultsError.value = err instanceof Error ? err.message : String(err)
  } finally {
    defaultsLoading.value = false
  }
}

async function loadTransitions() {
  if (!placementAdminEnabled.value || !isRealmAdmin.value) return
  transitionsLoading.value = true
  transitionsError.value = null
  transitionsUnsupported.value = false
  try {
    const resp = await listPlacementTransitions()
    transitions.value = resp.transitions
  } catch (err) {
    transitions.value = null
    if (isPlacementUnsupported(err)) transitionsUnsupported.value = true
    else transitionsError.value = err instanceof Error ? err.message : String(err)
  } finally {
    transitionsLoading.value = false
  }
}

async function saveDefaults() {
  if (!defaultsDraft.value || !defaultsDirty.value || busy.value || !isManagementNode.value) return
  saveError.value = null
  saveMessage.value = null
  try {
    const resp = await putRealmPlacementDefaults(defaultsDraft.value)
    defaultsResp.value = resp
    defaultsDraft.value = structuredClone(resp.default_strategy)
    saveMessage.value = 'Placement defaults saved.'
  } catch (err) {
    // A 400/403 carries the server's message — render it verbatim.
    saveError.value = err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err)
  }
}

function resetDefaults() {
  // defaultsResp is a ref, so .default_strategy is a reactive proxy — cloning a
  // proxy throws DataCloneError; toRaw() hands back the plain object.
  if (defaultsResp.value) defaultsDraft.value = structuredClone(toRaw(defaultsResp.value.default_strategy))
  saveError.value = null
  saveMessage.value = null
}

// Load once the gated+admin path becomes reachable; never before (so the
// disabled and forbidden states stay HTTP-free).
let loaded = false
watch(
  ready,
  (isReady) => {
    if (isReady && !loaded) {
      loaded = true
      void loadDefaults()
      void loadTransitions()
    }
  },
  { immediate: true },
)
</script>

<template>
  <div>
    <PageHeader title="Placement" description="Realm placement defaults, location health, and record transitions.">
      <template #actions>
        <Button variant="outline" size="sm" as-child>
          <RouterLink :to="{ name: 'admin' }">Admin</RouterLink>
        </Button>
      </template>
    </PageHeader>

    <div v-if="!bootstrapped" class="container max-w-[1400px] space-y-3 py-8">
      <Skeleton class="h-24" />
      <Skeleton class="h-40" />
    </div>

    <div v-else-if="!placementAdminEnabled" class="container max-w-[1400px] py-8">
      <section class="surface mx-auto max-w-xl p-8">
        <EmptyState
          title="Placement administration is not enabled"
          description="Enable the placementAdmin feature flag in portal-config.json once the backend serves the aruna#269 endpoints."
        >
          <template #icon><MapPinned class="h-8 w-8" /></template>
        </EmptyState>
      </section>
    </div>

    <div v-else-if="!currentUser || !isRealmAdmin" class="container max-w-[1400px] py-8">
      <section class="surface mx-auto max-w-xl p-8 text-center">
        <ShieldCheck class="mx-auto h-8 w-8 text-muted-foreground/70" />
        <h2 class="mt-3 font-display text-base font-semibold text-aruna-navy">Realm admin access required</h2>
        <p class="mt-1.5 text-sm text-muted-foreground">
          {{ isAuthenticated ? 'Your account does not hold the realm admin role needed to manage placement.' : 'Sign in with a realm admin account to manage placement.' }}
        </p>
      </section>
    </div>

    <div v-else class="container grid max-w-[1400px] gap-6 py-8 lg:grid-cols-[260px_1fr]">
      <nav class="flex flex-col gap-1 text-sm lg:sticky lg:top-20 lg:self-start">
        <a href="#locations" class="rounded-md bg-primary/5 px-3 py-2 font-medium text-primary">Locations</a>
        <a href="#defaults" class="rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground">Placement defaults</a>
        <a href="#transitions" class="rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground">Transitions</a>
      </nav>

      <div class="space-y-6">
        <section id="locations" class="surface scroll-mt-24">
          <header class="flex items-center justify-between border-b border-border px-5 py-4">
            <div class="flex items-center gap-2">
              <MapPinned class="h-4 w-4 text-primary" />
              <h3 class="font-display text-sm font-semibold text-aruna-navy">Locations</h3>
            </div>
            <RouterLink :to="{ name: 'status' }" class="text-xs font-medium text-primary hover:underline">Node status →</RouterLink>
          </header>
          <div class="px-5 py-4">
            <LocationAggregates :aggregates="locationAggregates" />
          </div>
        </section>

        <section id="defaults" class="surface scroll-mt-24">
          <header class="flex items-center gap-2 border-b border-border px-5 py-4">
            <SlidersHorizontal class="h-4 w-4 text-primary" />
            <h3 class="font-display text-sm font-semibold text-aruna-navy">Placement defaults</h3>
          </header>
          <div class="space-y-4 p-5">
            <p class="text-[11px] text-muted-foreground">
              Realms seed a replica-3 <code class="font-mono">default</code> strategy; registry and admin documents
              are placed everywhere by a separate built-in strategy.
            </p>
            <p v-if="!isManagementNode" class="surface-muted px-3 py-2 text-xs text-muted-foreground">
              This node is a read-only replica for realm configuration — placement mutations go through a management node.
            </p>

            <template v-if="defaultsLoading && !defaultsDraft">
              <Skeleton class="h-8" />
              <Skeleton class="h-8" />
            </template>
            <div
              v-else-if="defaultsUnsupported"
              class="rounded-md border border-border bg-muted/30 px-3 py-4 text-xs text-muted-foreground"
            >
              This backend does not serve placement defaults endpoints yet (aruna#269).
            </div>
            <ErrorPanel v-else-if="defaultsError" :message="defaultsError" @retry="loadDefaults" />
            <template v-else-if="defaultsDraft">
              <StrategyEditor v-model="defaultsDraft" :known-locations="knownLocations" :disabled="busy || !isManagementNode" />
              <p v-if="saveError" class="text-xs text-destructive">{{ saveError }}</p>
              <p v-else-if="saveMessage" class="text-xs text-emerald-700 dark:text-emerald-300">{{ saveMessage }}</p>
              <div class="flex items-center gap-2">
                <Button size="sm" :disabled="!defaultsDirty || busy || !isManagementNode" @click="saveDefaults">
                  Save defaults
                </Button>
                <Button variant="ghost" size="sm" :disabled="!defaultsDirty || busy" @click="resetDefaults">Reset</Button>
              </div>
            </template>
          </div>
        </section>

        <section id="transitions" class="surface scroll-mt-24">
          <header class="flex items-center justify-between border-b border-border px-5 py-4">
            <div class="flex items-center gap-2">
              <ArrowLeftRight class="h-4 w-4 text-primary" />
              <h3 class="font-display text-sm font-semibold text-aruna-navy">Transitions</h3>
            </div>
            <Button variant="ghost" size="sm" :disabled="transitionsLoading" @click="loadTransitions">
              <RefreshCw class="h-3.5 w-3.5" /> Reload
            </Button>
          </header>
          <div class="px-3 py-3">
            <template v-if="transitionsLoading && !transitions">
              <Skeleton class="mb-2 h-6" />
              <Skeleton class="h-6" />
            </template>
            <div
              v-else-if="transitionsUnsupported"
              class="rounded-md border border-border bg-muted/30 px-3 py-4 text-xs text-muted-foreground"
            >
              This backend does not report placement transitions yet (aruna#269). They appear once the balancer ships.
            </div>
            <ErrorPanel v-else-if="transitionsError" :message="transitionsError" @retry="loadTransitions" />
            <TransitionsTable v-else :transitions="transitions ?? []" />
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
