<script setup lang="ts">
import { computed } from 'vue'
import { formatBytes } from '@/lib/utils'
import { QUOTA_BAR_COLORS } from '@/lib/quota'

const props = withDefaults(
  defineProps<{
    used: number
    // Effective quota in bytes; null/undefined = unlimited (explicit presentation).
    quota?: number | null
    // Enforced hard cap (quota x grace). Renders the hatched grace zone
    // between quota and ceiling; ignored when quota is unlimited.
    ceiling?: number | null
    // Referenced bytes stay at their source: named in the labels, never drawn in the bar.
    referenced?: number
    // Server-computed warn flag (GroupQuotaStatus.warning). When provided it
    // replaces the legacy 75/90% tone heuristic.
    warn?: boolean
    color?: string
    compact?: boolean
    showLabels?: boolean
    label?: string
  }>(),
  { showLabels: true, color: QUOTA_BAR_COLORS.counted, referenced: 0 },
)

const unlimited = computed(() => props.quota == null)
// Guard nonsense inputs: a cap only makes sense above a finite quota.
const ceilingBytes = computed(() =>
  props.ceiling != null && props.quota != null && props.ceiling >= props.quota ? props.ceiling : null,
)
const referencedBytes = computed(() => Math.max(0, props.referenced ?? 0))
// The track spans the hard cap (or quota when no cap) and stretches when usage overflows, so
// the overflow stays visible instead of silently clamping.
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
  if (overCeiling.value) return QUOTA_BAR_COLORS.danger
  if (overQuota.value) return QUOTA_BAR_COLORS.warn
  if (props.warn !== undefined) return props.warn ? QUOTA_BAR_COLORS.warn : props.color
  // Legacy heuristic for callers that pass neither warn nor a cap.
  if (pctOfQuota.value > 90) return QUOTA_BAR_COLORS.danger
  if (pctOfQuota.value > 75) return QUOTA_BAR_COLORS.warn
  return props.color
})
</script>

<template>
  <div class="flex w-full flex-col gap-1.5">
    <div
      v-if="showLabels"
      class="flex items-center justify-between text-xs"
    >
      <span class="font-medium text-muted-foreground">{{ label ?? 'Storage' }}</span>
      <span class="flex flex-wrap items-baseline justify-end gap-x-3 tabular-nums text-foreground/80">
        <span v-if="unlimited">{{ formatBytes(used) }} <span class="text-muted-foreground">stored, no quota</span></span>
        <template v-else>
          <span>{{ formatBytes(used) }} <span class="text-muted-foreground">of {{ formatBytes(quota ?? 0) }}</span></span>
          <span v-if="ceilingBytes != null && ceilingBytes !== quota" class="text-muted-foreground">cap {{ formatBytes(ceilingBytes) }}</span>
          <span class="text-muted-foreground">{{ pctOfQuota.toFixed(0) }}%</span>
        </template>
        <span v-if="referencedBytes > 0" class="text-muted-foreground">{{ formatBytes(referencedBytes) }} referenced</span>
      </span>
    </div>
    <!-- Only a quota gives the bar a meaning; without one the values above say it all. -->
    <div
      v-if="!unlimited"
      :class="['relative w-full rounded-full bg-muted', compact ? 'h-1' : 'h-2']"
      role="meter"
      :aria-label="label ?? 'Storage'"
      :aria-valuenow="used"
      :aria-valuemin="0"
      :aria-valuemax="ceilingBytes ?? quota ?? undefined"
    >
      <!-- Grace zone (hatched) sits under the fill. -->
      <span
        v-if="ceilingPct != null && ceilingPct > quotaPct"
        class="absolute inset-y-0"
        :class="ceilingPct >= 100 ? 'rounded-r-full' : ''"
        :style="{
          left: `${quotaPct}%`,
          width: `${ceilingPct - quotaPct}%`,
          backgroundImage:
            'repeating-linear-gradient(45deg, rgba(51,93,198,0.35) 0 2px, transparent 2px 5px)',
        }"
      />
      <span
        class="absolute inset-y-0 left-0 rounded-full transition-[width,background-color]"
        :style="{ width: `${usedPct}%`, backgroundColor: tone }"
      />
      <!-- Quota marker. -->
      <span
        v-if="quotaPct < 100"
        class="absolute -inset-y-[3px] w-0.5 bg-foreground/50"
        :style="{ left: `${quotaPct}%` }"
      />
      <!-- Ceiling marker, only visible once usage overflowed past the cap. -->
      <span
        v-if="ceilingPct != null && ceilingPct < 100"
        class="absolute inset-y-0 w-px bg-rose-600/70"
        :style="{ left: `${ceilingPct}%` }"
      />
    </div>
  </div>
</template>
