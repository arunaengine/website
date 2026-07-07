<script setup lang="ts">
import { computed } from 'vue'
import { formatBytes } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    used: number
    // Effective quota in bytes; null/undefined = unlimited (explicit presentation).
    quota?: number | null
    // Enforced hard cap (quota x grace). Renders the hatched grace zone
    // between quota and ceiling; ignored when quota is unlimited.
    ceiling?: number | null
    // Server-computed warn flag (GroupQuotaStatus.warning). When provided it
    // replaces the legacy 75/90% tone heuristic.
    warn?: boolean
    color?: string
    compact?: boolean
    showLabels?: boolean
    label?: string
  }>(),
  { showLabels: true, color: '#335DC6' },
)

const unlimited = computed(() => props.quota == null)
// Guard nonsense inputs: a cap only makes sense above a finite quota.
const ceilingBytes = computed(() =>
  props.ceiling != null && props.quota != null && props.ceiling >= props.quota ? props.ceiling : null,
)
// The track spans the hard cap (or quota when no cap) and stretches when usage
// overflows so the overflow stays visible instead of silently clamping.
const span = computed(() => Math.max(ceilingBytes.value ?? props.quota ?? 0, props.used, 1))
// Label keeps % of quota (same meaning as before).
const pctOfQuota = computed(() => (!props.quota ? 0 : (props.used / props.quota) * 100))
const usedPct = computed(() => Math.min(100, (props.used / span.value) * 100))
const quotaPct = computed(() => (props.quota == null ? 0 : (props.quota / span.value) * 100))
const ceilingPct = computed(() =>
  ceilingBytes.value == null ? null : (ceilingBytes.value / span.value) * 100,
)

const overQuota = computed(() => !unlimited.value && !!props.quota && props.used >= props.quota)
const overCeiling = computed(() => ceilingBytes.value != null && props.used >= ceilingBytes.value)

const tone = computed(() => {
  if (overCeiling.value) return '#DC2626'
  if (overQuota.value) return '#D97706'
  if (props.warn !== undefined) return props.warn ? '#D97706' : props.color
  // Legacy heuristic for callers that pass neither warn nor a cap.
  if (pctOfQuota.value > 90) return '#DC2626'
  if (pctOfQuota.value > 75) return '#D97706'
  return props.color
})
</script>

<template>
  <div class="flex w-full flex-col gap-1.5">
    <div
      v-if="showLabels"
      class="flex items-center justify-between text-[11px]"
    >
      <span class="font-medium text-muted-foreground">{{ label ?? 'Storage' }}</span>
      <span v-if="unlimited" class="tabular-nums text-foreground/80">
        {{ formatBytes(used) }} <span class="text-muted-foreground">· unlimited</span>
      </span>
      <span v-else class="tabular-nums text-foreground/80">
        {{ formatBytes(used) }} <span class="text-muted-foreground">of</span>
        {{ formatBytes(quota ?? 0) }}
        <span v-if="ceilingBytes != null && ceilingBytes !== quota" class="text-muted-foreground">· cap {{ formatBytes(ceilingBytes) }}</span>
        <span class="ml-1 text-muted-foreground">({{ pctOfQuota.toFixed(0) }}%)</span>
      </span>
    </div>
    <div
      :class="[
        'relative w-full overflow-hidden rounded-full bg-muted',
        compact ? 'h-1' : 'h-1.5',
        unlimited ? 'opacity-60' : '',
      ]"
      :role="unlimited ? undefined : 'meter'"
      :aria-label="unlimited ? undefined : (label ?? 'Storage')"
      :aria-valuenow="unlimited ? undefined : used"
      :aria-valuemin="unlimited ? undefined : 0"
      :aria-valuemax="unlimited ? undefined : (ceilingBytes ?? quota ?? undefined)"
    >
      <template v-if="!unlimited">
        <!-- Grace zone (hatched) sits under the fill. -->
        <span
          v-if="ceilingPct != null && ceilingPct > quotaPct"
          class="absolute inset-y-0"
          :style="{
            left: `${quotaPct}%`,
            width: `${ceilingPct - quotaPct}%`,
            backgroundImage:
              'repeating-linear-gradient(45deg, rgba(217,119,6,0.35) 0 2px, transparent 2px 5px)',
          }"
        />
        <span
          class="absolute inset-y-0 left-0 rounded-full transition-all"
          :style="{ width: `${usedPct}%`, backgroundColor: tone }"
        />
        <!-- Quota marker. -->
        <span
          v-if="ceilingPct != null"
          class="absolute inset-y-0 w-px bg-foreground/40"
          :style="{ left: `${quotaPct}%` }"
        />
        <!-- Ceiling marker, only visible once usage overflowed past the cap. -->
        <span
          v-if="ceilingPct != null && ceilingPct < 100"
          class="absolute inset-y-0 w-px bg-rose-600/70"
          :style="{ left: `${ceilingPct}%` }"
        />
      </template>
    </div>
  </div>
</template>
