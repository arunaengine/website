<script setup lang="ts">
import { computed, ref, toRaw, watch } from 'vue'
import { RouterLink } from 'vue-router'
import StrategyEditor from '@/components/placement/StrategyEditor.vue'
import NodeAttributesSection from '@/components/storage/NodeAttributesSection.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useAruna } from '@/composables/useAruna'
import { useRefresh } from '@/composables/useRefresh'
import {
  isPlacementUnsupported,
  placementMutationErrorMessage,
  usePlacement,
} from '@/composables/usePlacement'
import { apiErrorMessage, type RealmPlacementBinding, type RealmPlacementStrategy } from '@/lib/api'
import {
  knownLocations as computeKnownLocations,
  type RealmPlacementConfigResponse,
} from '@/lib/placement'
import { Layers, Link2, Plus, SlidersHorizontal } from '@lucide/vue'

// Realm-admin access is gated by the parent AdminView; this panel only guards
// the placement feature flag.
const { bootstrapped, currentUser, isRealmAdmin, realmInfo } = useAruna()
const { placementAdminEnabled, busy, getRealmPlacement, mutateRealmPlacement } = usePlacement()

const knownLocations = computed(() => computeKnownLocations(realmInfo.value?.nodes ?? []))
const ready = computed(
  () =>
    bootstrapped.value &&
    placementAdminEnabled.value &&
    Boolean(currentUser.value) &&
    isRealmAdmin.value,
)

const config = ref<RealmPlacementConfigResponse | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
const unsupported = ref(false)
const saveError = ref<string | null>(null)
const saveMessage = ref<string | null>(null)

const selectedStrategyId = ref('')
const strategyDraft = ref<RealmPlacementStrategy | null>(null)
const creatingStrategy = ref(false)

const strategyOptions = computed(() =>
  (config.value?.strategies ?? []).map((strategy) => ({
    value: strategy.strategy_id,
    label: strategy.name,
  })),
)
const storedStrategy = computed(() =>
  config.value?.strategies.find((strategy) => strategy.strategy_id === selectedStrategyId.value) ?? null,
)
const strategyDirty = computed(() => {
  if (!strategyDraft.value) return false
  if (creatingStrategy.value) return true
  return JSON.stringify(strategyDraft.value) !== JSON.stringify(storedStrategy.value)
})
const selectedIsDefault = computed(
  () => Boolean(strategyDraft.value && strategyDraft.value.strategy_id === config.value?.default_strategy_id),
)
const selectedIsJobFamily = computed(
  () =>
    Boolean(
      !creatingStrategy.value &&
        strategyDraft.value &&
        strategyDraft.value.strategy_id === config.value?.job_family_strategy_id,
    ),
)

function cloneStrategy(strategy: RealmPlacementStrategy): RealmPlacementStrategy {
  return structuredClone(toRaw(strategy))
}

function selectStrategy(strategyId: string) {
  const strategy = config.value?.strategies.find((candidate) => candidate.strategy_id === strategyId)
  if (!strategy) return
  creatingStrategy.value = false
  selectedStrategyId.value = strategyId
  strategyDraft.value = cloneStrategy(strategy)
  saveError.value = null
  saveMessage.value = null
}

watch(selectedStrategyId, (strategyId) => {
  if (!creatingStrategy.value) selectStrategy(strategyId)
})

function applyConfig(next: RealmPlacementConfigResponse, preferredId?: string) {
  config.value = next
  const strategyId =
    preferredId && next.strategies.some((strategy) => strategy.strategy_id === preferredId)
      ? preferredId
      : next.default_strategy_id || next.strategies[0]?.strategy_id || ''
  if (strategyId) selectStrategy(strategyId)
  if (!bindingStrategyId.value) bindingStrategyId.value = strategyId
}

async function loadPlacement() {
  if (!ready.value) return
  loading.value = true
  loadError.value = null
  unsupported.value = false
  saveError.value = null
  saveMessage.value = null
  try {
    applyConfig(await getRealmPlacement(), selectedStrategyId.value)
  } catch (err) {
    config.value = null
    strategyDraft.value = null
    if (isPlacementUnsupported(err)) unsupported.value = true
    else loadError.value = apiErrorMessage(err)
  } finally {
    loading.value = false
  }
}

const { busy: reloadBusy, refresh: onReload } = useRefresh(loadPlacement)
const spinning = computed(() => reloadBusy.value || loading.value)

function createStrategy() {
  creatingStrategy.value = true
  selectedStrategyId.value = ''
  strategyDraft.value = {
    strategy_id: '',
    name: 'New rule',
    replica_count: 3,
    distinct_locations: true,
    affinity: [],
    shard_count: 64,
  }
  saveError.value = null
  saveMessage.value = null
}

function resetStrategy() {
  if (creatingStrategy.value) createStrategy()
  else if (storedStrategy.value) strategyDraft.value = cloneStrategy(storedStrategy.value)
  saveError.value = null
  saveMessage.value = null
}

async function saveStrategy() {
  if (!strategyDraft.value || !strategyDirty.value || busy.value) return
  saveError.value = null
  saveMessage.value = null
  const strategy = cloneStrategy(strategyDraft.value)
  if (!strategy.strategy_id.trim()) {
    saveError.value = 'A new rule needs an id.'
    return
  }
  try {
    const next = await mutateRealmPlacement({ mutation: 'upsert_strategy', strategy })
    creatingStrategy.value = false
    applyConfig(next, strategy.strategy_id)
    saveMessage.value = 'Record placement rule saved.'
  } catch (err) {
    saveError.value = placementMutationErrorMessage(err)
  }
}

async function setDefaultStrategy() {
  const strategyId = strategyDraft.value?.strategy_id
  if (!strategyId || strategyDirty.value || busy.value) return
  saveError.value = null
  saveMessage.value = null
  try {
    applyConfig(
      await mutateRealmPlacement({ mutation: 'set_default_strategy', strategy_id: strategyId }),
      strategyId,
    )
    saveMessage.value = 'This rule is now the realm default.'
  } catch (err) {
    saveError.value = placementMutationErrorMessage(err)
  }
}

async function removeStrategy() {
  const strategyId = strategyDraft.value?.strategy_id
  if (!strategyId || creatingStrategy.value || selectedIsJobFamily.value || strategyDirty.value || busy.value) return
  saveError.value = null
  saveMessage.value = null
  try {
    applyConfig(await mutateRealmPlacement({ mutation: 'remove_strategy', strategy_id: strategyId }))
    saveMessage.value = 'Record placement rule removed.'
  } catch (err) {
    saveError.value = placementMutationErrorMessage(err)
  }
}

const groupBindings = computed(() =>
  (config.value?.bindings ?? []).filter(
    (binding): binding is RealmPlacementBinding & { scope: { kind: 'group'; group_id: string } } =>
      binding.scope.kind === 'group',
  ),
)
const otherBindingCount = computed(
  () => (config.value?.bindings.length ?? 0) - groupBindings.value.length,
)
const bindingGroupId = ref('')
const bindingStrategyId = ref('')
const bindingError = ref<string | null>(null)

async function saveGroupBinding() {
  const groupId = bindingGroupId.value.trim()
  if (!groupId || !bindingStrategyId.value || busy.value) return
  bindingError.value = null
  try {
    applyConfig(
      await mutateRealmPlacement({
        mutation: 'set_binding',
        binding: {
          scope: { kind: 'group', group_id: groupId },
          strategy_id: bindingStrategyId.value,
        },
      }),
      selectedStrategyId.value,
    )
    bindingGroupId.value = ''
  } catch (err) {
    bindingError.value = placementMutationErrorMessage(err)
  }
}

async function removeGroupBinding(binding: RealmPlacementBinding) {
  if (binding.scope.kind !== 'group' || busy.value) return
  bindingError.value = null
  try {
    applyConfig(
      await mutateRealmPlacement({ mutation: 'remove_binding', scope: binding.scope }),
      selectedStrategyId.value,
    )
  } catch (err) {
    bindingError.value = placementMutationErrorMessage(err)
  }
}

let loaded = false
watch(
  ready,
  (isReady) => {
    if (isReady && !loaded) {
      loaded = true
      void loadPlacement()
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

    <div v-else-if="!placementAdminEnabled" class="container py-8">
      <section class="surface mx-auto max-w-xl p-8">
        <EmptyState
          title="Record placement is not enabled on this portal"
          description="Set features.placementAdmin in portal-config.json for a backend that serves the realm placement API."
        >
          <template #icon><Layers class="h-8 w-8" /></template>
        </EmptyState>
      </section>
    </div>

    <div v-else class="container space-y-5 py-6">
      <div class="surface flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <p class="max-w-3xl text-sm text-muted-foreground">
          Record placement decides which nodes hold dataset records and system jobs. It never
          decides where files are stored: that is the storage backend of the node taking the upload,
          and the placement policies the bucket carries.
        </p>
        <RouterLink :to="{ name: 'status' }" class="text-xs font-medium text-primary hover:underline">
          See the realm locations on Status
        </RouterLink>
      </div>

      <NodeAttributesSection />

      <div class="space-y-5">
        <section id="strategies" class="surface scroll-mt-24">
          <header class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
            <div class="flex items-center gap-2">
              <SlidersHorizontal class="h-4 w-4 text-primary" />
              <h3 class="font-display text-sm font-semibold text-aruna-navy">Record placement rules</h3>
            </div>
            <RefreshButton :busy="spinning" :disabled="busy" label="Reload" @click="onReload" />
          </header>
          <div class="space-y-4 p-5">
            <template v-if="loading && !config">
              <Skeleton class="h-8" />
              <Skeleton class="h-32" />
            </template>
            <EmptyState v-else-if="unsupported" compact title="This node does not serve record placement." />
            <ErrorPanel v-else-if="loadError" :message="loadError" @retry="loadPlacement" />
            <template v-else-if="config">
              <div class="flex flex-wrap items-center gap-2">
                <Select v-if="strategyOptions.length" v-model="selectedStrategyId" :options="strategyOptions" class="min-w-56" :disabled="busy" />
                <Button variant="outline" size="sm" :disabled="busy" @click="createStrategy"><Plus class="h-3.5 w-3.5" /> New rule</Button>
              </div>

              <template v-if="strategyDraft">
                <div v-if="creatingStrategy">
                  <label class="text-xs font-medium text-foreground">Rule id</label>
                  <Input v-model="strategyDraft.strategy_id" class="mt-1 font-mono" placeholder="A new id" :disabled="busy" />
                </div>
                <div v-else>
                  <div class="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span class="font-mono">{{ strategyDraft.strategy_id }}</span>
                    <span v-if="selectedIsDefault" class="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">realm default</span>
                    <Badge v-if="selectedIsJobFamily" variant="accent">Run family</Badge>
                  </div>
                  <p v-if="selectedIsJobFamily" class="mt-1 text-[11px] text-muted-foreground">
                    Places run family records. It cannot be removed, and its shard count is frozen.
                  </p>
                </div>

                <StrategyEditor
                  v-model="strategyDraft"
                  :known-locations="knownLocations"
                  :disabled="busy"
                  :shard-count-locked="selectedIsJobFamily"
                />
                <p v-if="saveError" class="text-xs text-destructive">{{ saveError }}</p>
                <p v-else-if="saveMessage" class="text-xs text-emerald-700 dark:text-emerald-300">{{ saveMessage }}</p>
                <div class="flex flex-wrap items-center gap-2">
                  <Button size="sm" :disabled="!strategyDirty || busy" @click="saveStrategy">Save rule</Button>
                  <Button variant="ghost" size="sm" :disabled="!strategyDirty || busy" @click="resetStrategy">Reset</Button>
                  <Button variant="outline" size="sm" :disabled="selectedIsDefault || strategyDirty || busy" @click="setDefaultStrategy">Use for the whole realm</Button>
                  <Button
                    v-if="!creatingStrategy"
                    variant="destructive"
                    size="sm"
                    :disabled="selectedIsJobFamily || strategyDirty || busy"
                    :title="selectedIsJobFamily ? 'The run family rule cannot be removed, and its shard count is frozen.' : undefined"
                    @click="removeStrategy"
                  >
                    Remove rule
                  </Button>
                </div>
              </template>
            </template>
          </div>
        </section>

        <section id="group-bindings" class="surface scroll-mt-24">
          <header class="flex items-center gap-2 border-b border-border px-5 py-4">
            <Link2 class="h-4 w-4 text-primary" />
            <h3 class="font-display text-sm font-semibold text-aruna-navy">Group bindings</h3>
          </header>
          <div class="space-y-4 p-5">
            <div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <Input v-model="bindingGroupId" class="font-mono" placeholder="Group id" :disabled="busy || !config" />
              <Select v-model="bindingStrategyId" :options="strategyOptions" :disabled="busy || !config" />
              <Button size="sm" :disabled="busy || !bindingGroupId.trim() || !bindingStrategyId" @click="saveGroupBinding">Set binding</Button>
            </div>
            <p v-if="bindingError" class="text-xs text-destructive">{{ bindingError }}</p>
            <p v-if="otherBindingCount || config?.overrides.length" class="text-[11px] text-muted-foreground">
              {{ otherBindingCount }} binding(s) that are not per group and
              {{ config?.overrides.length ?? 0 }} node pin(s) are kept and stay readable through the API.
            </p>
            <EmptyState v-if="config && !groupBindings.length" compact title="No group uses a rule of its own." description="Every group follows the realm default until a binding is added here." />
            <ul v-else class="divide-y divide-border rounded-md border border-border">
              <li v-for="binding in groupBindings" :key="binding.scope.group_id" class="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-xs">
                <div>
                  <div class="font-mono text-foreground">{{ binding.scope.group_id }}</div>
                  <div class="text-muted-foreground">{{ config?.strategies.find((strategy) => strategy.strategy_id === binding.strategy_id)?.name || binding.strategy_id }}</div>
                </div>
                <Button variant="ghost" size="sm" :disabled="busy" @click="removeGroupBinding(binding)">Remove</Button>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
