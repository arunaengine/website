<script setup lang="ts">
// Outstanding-secrets table over VIEW-MODEL rows (SecretRow), not the raw API
// type, so the device-enrollment flow (aruna#271) can map its own enrollments
// into the same table. All labels/variants/links are supplied by the caller;
// no onboarding copy or API calls live here. Revoke is an inline two-step
// confirm — no extra dialog component.
import { computed, onUnmounted, ref } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import CopyButton from '@/components/nodes/CopyButton.vue'
import type { BadgeVariant } from '@/components/nodes/node-display'
import { truncateMiddle } from '@/lib/utils'

export interface SecretRow {
  id: string
  kindLabel: string
  kindVariant: BadgeVariant
  // null = never expires.
  expiresAt: number | null
  expiresHint?: string
  status: 'outstanding' | 'claimed' | 'expired'
  claimedBy?: string | null
  // Rendered as a RouterLink when set (e.g. a deep link to Status).
  claimedLink?: RouteLocationRaw | null
}

const props = defineProps<{ rows: SecretRow[]; busyIds: string[]; canRevoke: boolean }>()
const emit = defineEmits<{ (e: 'revoke', id: string): void }>()

const busy = computed(() => new Set(props.busyIds))

// Live clock for the expiry countdown; 1s cadence, cleared on unmount.
const nowMs = ref(Date.now())
const clock = window.setInterval(() => (nowMs.value = Date.now()), 1000)
onUnmounted(() => window.clearInterval(clock))

function expiresLabel(row: SecretRow): string {
  if (row.expiresAt == null) return 'never'
  const remaining = Math.floor(row.expiresAt - nowMs.value / 1000)
  if (remaining <= 0) return 'expired'
  const h = Math.floor(remaining / 3600)
  const m = Math.floor((remaining % 3600) / 60)
  const s = remaining % 60
  if (h > 0) return `in ${h}h ${m}m`
  if (m > 0) return `in ${m}m ${s}s`
  return `in ${s}s`
}

const STATUS_VARIANT: Record<SecretRow['status'], BadgeVariant> = {
  outstanding: 'outline',
  claimed: 'success',
  expired: 'secondary',
}

// Inline two-step confirm so revoke needs no extra dialog component; the pending
// confirm auto-resets after 4s.
const confirmingId = ref<string | null>(null)
let confirmTimer: number | undefined

function requestRevoke(id: string) {
  window.clearTimeout(confirmTimer)
  confirmingId.value = id
  confirmTimer = window.setTimeout(() => (confirmingId.value = null), 4000)
}

function confirmRevoke(id: string) {
  window.clearTimeout(confirmTimer)
  confirmingId.value = null
  emit('revoke', id)
}

onUnmounted(() => window.clearTimeout(confirmTimer))
</script>

<template>
  <div class="overflow-x-auto">
    <table class="w-full text-left text-sm">
      <thead>
        <tr class="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
          <th class="px-3 py-2 font-medium">Kind</th>
          <th class="px-3 py-2 font-medium">Enrollment id</th>
          <th class="px-3 py-2 font-medium">Expires</th>
          <th class="px-3 py-2 font-medium">Status</th>
          <th class="px-3 py-2" />
        </tr>
      </thead>
      <tbody class="divide-y divide-border">
        <tr v-for="row in rows" :key="row.id" class="align-middle">
          <td class="px-3 py-2.5">
            <Badge :variant="row.kindVariant" class="text-[10px] uppercase">{{ row.kindLabel }}</Badge>
          </td>
          <td class="px-3 py-2.5">
            <div class="flex items-center gap-1.5">
              <code class="font-mono text-xs text-foreground/90" :title="row.id">{{ truncateMiddle(row.id, 8, 6) }}</code>
              <CopyButton :value="row.id" label="Copy enrollment id" />
            </div>
          </td>
          <td class="px-3 py-2.5">
            <div class="tabular-nums text-xs text-foreground/90">{{ expiresLabel(row) }}</div>
            <div v-if="row.expiresHint" class="text-[10px] text-muted-foreground">{{ row.expiresHint }}</div>
          </td>
          <td class="px-3 py-2.5">
            <div class="flex flex-col items-start gap-0.5">
              <Badge :variant="STATUS_VARIANT[row.status]" class="text-[10px] uppercase">{{ row.status }}</Badge>
              <RouterLink
                v-if="row.status === 'claimed' && row.claimedBy && row.claimedLink"
                :to="row.claimedLink"
                class="font-mono text-[10px] text-primary hover:underline"
                :title="row.claimedBy"
              >
                {{ truncateMiddle(row.claimedBy, 8, 6) }}
              </RouterLink>
              <span
                v-else-if="row.status === 'claimed' && row.claimedBy"
                class="font-mono text-[10px] text-muted-foreground"
                :title="row.claimedBy"
              >
                {{ truncateMiddle(row.claimedBy, 8, 6) }}
              </span>
            </div>
          </td>
          <td class="px-3 py-2.5 text-right">
            <template v-if="canRevoke">
              <span v-if="busy.has(row.id)" class="text-xs text-muted-foreground">Revoking…</span>
              <Button
                v-else-if="confirmingId === row.id"
                variant="destructive"
                size="sm"
                @click="confirmRevoke(row.id)"
              >
                Confirm revoke
              </Button>
              <Button
                v-else
                variant="ghost"
                size="sm"
                class="text-destructive hover:text-destructive"
                @click="requestRevoke(row.id)"
              >
                Revoke
              </Button>
            </template>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td colspan="5" class="px-3 py-8 text-center text-xs text-muted-foreground">
            No outstanding onboarding secrets.
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
