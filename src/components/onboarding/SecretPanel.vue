<script setup lang="ts">
// Reusable copy-once secret panel (aruna#277), visually modeled on the created
// state of CreateCredentialDialog (amber ShieldAlert strip + mono value row +
// CopyButton). It knows nothing about what the secret unlocks, so the
// device-enrollment flow (aruna#271) reuses it with secretLabel="Device token".
// Pass expiresAt=null for a secret with no expiry (no countdown rendered).
import { computed, onUnmounted, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import CopyButton from '@/components/nodes/CopyButton.vue'
import { ShieldAlert } from '@lucide/vue'
import Notice from '@/components/ui/Notice.vue'

const props = withDefaults(
  defineProps<{
    secret: string
    secretLabel?: string
    // Unix seconds; null/undefined = no expiry.
    expiresAt?: number | null
    notice?: string
  }>(),
  {
    secretLabel: 'Onboarding secret',
    expiresAt: null,
    notice: 'The secret is shown once. Copy it now; it cannot be retrieved later.',
  },
)

const nowMs = ref(Date.now())
let timer: number | undefined

// Live 1s clock only while there is an expiry to count down to.
watch(
  () => props.expiresAt,
  (expiresAt) => {
    window.clearInterval(timer)
    timer = undefined
    if (expiresAt == null) return
    nowMs.value = Date.now()
    timer = window.setInterval(() => (nowMs.value = Date.now()), 1000)
  },
  { immediate: true },
)
onUnmounted(() => window.clearInterval(timer))

const remainingSecs = computed(() =>
  props.expiresAt == null ? null : Math.floor(props.expiresAt - nowMs.value / 1000),
)
const expired = computed(() => remainingSecs.value != null && remainingSecs.value <= 0)

function fmtDuration(total: number): string {
  const s = Math.max(0, total)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

const countdownLabel = computed(() =>
  remainingSecs.value == null ? '' : fmtDuration(remainingSecs.value),
)
const absoluteLabel = computed(() =>
  props.expiresAt == null ? '' : new Date(props.expiresAt * 1000).toLocaleString(),
)
</script>

<template>
  <div class="space-y-3">
    <Notice tone="warning" class="flex items-start gap-2">
      <ShieldAlert class="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{{ notice }}</span>
    </Notice>
    <div class="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
      <div class="min-w-0">
        <div class="text-[10px] uppercase tracking-wider text-muted-foreground">{{ secretLabel }}</div>
        <div class="break-all font-mono text-xs">{{ secret }}</div>
      </div>
      <CopyButton :value="secret" :label="`Copy ${secretLabel.toLowerCase()}`" />
    </div>
    <div v-if="expiresAt != null" class="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
      <Badge size="sm" :variant="expired ? 'destructive' : 'outline'" class="uppercase">
        {{ expired ? 'Expired' : `Expires in ${countdownLabel}` }}
      </Badge>
      <span class="tabular-nums">{{ absoluteLabel }}</span>
    </div>
  </div>
</template>
