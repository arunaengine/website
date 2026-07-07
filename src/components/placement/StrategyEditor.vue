<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Input from '@/components/ui/Input.vue'
import Switch from '@/components/ui/Switch.vue'
import { Pin } from '@lucide/vue'
import { isLocationPin, locationPins, setLocationPins } from '@/lib/placement'
import type { PlacementStrategyConfig } from '@/lib/api'

// Presentational only: no API calls, no flag checks. Emits a fresh config on
// every change and never mutates the prop, so the parent owns dirty tracking.
const props = defineProps<{
  modelValue: PlacementStrategyConfig
  // The realm's known locations (lib/placement.ts knownLocations) feeding the pin chips.
  knownLocations: string[]
  disabled?: boolean
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: PlacementStrategyConfig): void }>()

function update(patch: Partial<PlacementStrategyConfig>) {
  emit('update:modelValue', { ...props.modelValue, ...patch })
}

const storeOnAll = computed(() => props.modelValue.replica_count === null)

// Remember the last explicit replica count so toggling "all eligible" off
// restores it instead of dropping to 1.
const lastCount = ref(props.modelValue.replica_count ?? 3)
watch(
  () => props.modelValue.replica_count,
  (n) => {
    if (n !== null) lastCount.value = n
  },
)

function setStoreOnAll(on: boolean) {
  update({ replica_count: on ? null : Math.max(1, Math.floor(lastCount.value)) })
}

// Structural clamp only (min="1"); policy bounds are the server's job.
const replicaCount = computed<string | number>({
  get: () => props.modelValue.replica_count ?? '',
  set: (v) => update({ replica_count: Math.max(1, Math.floor(Number(v) || 1)) }),
})

const spreadNote = computed(
  () =>
    props.modelValue.distinct_locations &&
    props.modelValue.replica_count != null &&
    props.modelValue.replica_count > props.knownLocations.length,
)

const pinned = computed(() => new Set(locationPins(props.modelValue.affinity)))
function togglePin(location: string) {
  const next = new Set(pinned.value)
  if (next.has(location)) next.delete(location)
  else next.add(location)
  update({ affinity: setLocationPins(props.modelValue.affinity, [...next]) })
}

// Non-location affinity rules are shown read-only and preserved on save.
const preservedRules = computed(() => props.modelValue.affinity.filter((rule) => !isLocationPin(rule)))
function ruleLabel(rule: PlacementStrategyConfig['affinity'][number]): string {
  const target = `${rule.key}=${rule.value}`
  return rule.effect === 'multiply' ? `${target} → ×${rule.permille ?? 1000}‰` : `${target} → filter`
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <label class="inline-flex items-center gap-2 text-xs font-medium text-foreground">
        <Switch :checked="storeOnAll" :disabled="disabled" @update:checked="setStoreOnAll" />
        Store on all eligible nodes
      </label>
      <div v-if="!storeOnAll" class="mt-2 flex items-center gap-2">
        <Input v-model="replicaCount" type="number" min="1" step="1" class="w-28" :disabled="disabled" />
        <span class="text-[11px] text-muted-foreground">copies per record</span>
      </div>
      <p class="mt-1 text-[11px] text-muted-foreground">
        How many copies of each record the realm keeps for this scope.
      </p>
    </div>

    <div>
      <label class="inline-flex items-center gap-2 text-xs font-medium text-foreground">
        <Switch
          :checked="modelValue.distinct_locations"
          :disabled="disabled"
          @update:checked="update({ distinct_locations: $event })"
        />
        Spread replicas across distinct locations
      </label>
      <p v-if="spreadNote" class="mt-1 text-[11px] text-muted-foreground">
        The realm currently reports only {{ knownLocations.length }}
        {{ knownLocations.length === 1 ? 'distinct location' : 'distinct locations' }}.
      </p>
    </div>

    <div>
      <div class="text-xs font-medium text-foreground">Location pins</div>
      <div v-if="knownLocations.length" class="mt-1.5 flex flex-wrap gap-1.5">
        <button
          v-for="location in knownLocations"
          :key="location"
          type="button"
          :disabled="disabled"
          :aria-pressed="pinned.has(location)"
          class="disabled:cursor-not-allowed disabled:opacity-60"
          @click="togglePin(location)"
        >
          <Badge :variant="pinned.has(location) ? 'default' : 'outline'" class="gap-1">
            <Pin class="h-3 w-3" />
            {{ location }}
          </Badge>
        </button>
      </div>
      <p v-else class="mt-1.5 text-[11px] text-muted-foreground">
        The realm reports no placement locations yet — pinning becomes available once nodes are mapped.
      </p>
      <p class="mt-1 text-[11px] text-muted-foreground">
        Pinning restricts placement to the selected locations (affinity filter rules).
      </p>
    </div>

    <div v-if="preservedRules.length">
      <div class="text-xs font-medium text-foreground">Other affinity rules</div>
      <div class="mt-1.5 flex flex-wrap gap-1.5">
        <span
          v-for="(rule, i) in preservedRules"
          :key="i"
          class="rounded-md border border-border bg-muted/40 px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
        >
          {{ ruleLabel(rule) }}
        </span>
      </div>
      <p class="mt-1 text-[11px] text-muted-foreground">Preserved as-is on save; edit via the API.</p>
    </div>
  </div>
</template>
