<script setup lang="ts">
// Supervisor view of the node Aruna Desktop embeds. Everything here comes from
// the shell bridge, so a command the shell does not implement is reported as
// such instead of rendering an invented status.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { useRefresh } from '@/composables/useRefresh'
import { appQuit, nodeLogsTail, nodeStatus, type NodeStatus } from '@/lib/desktopBridge'
import { follow, onWake, POLL_IDLE_MS } from '@/lib/poll'
import { formatDuration, truncateMiddle } from '@/lib/utils'
import { Power, RefreshCw } from '@lucide/vue'

const LOG_LINES = 200

// The node id comes from the node's own API, which the shared status already
// reads with the owner's token.
const { identity, identityError } = useDeviceStatus()

const status = ref<NodeStatus | null>(null)
const logs = ref<string[]>([])
const statusError = ref<string | null>(null)
const logsError = ref<string | null>(null)
const busy = ref(false)
const quitting = ref(false)
const quitError = ref<string | null>(null)

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function refresh(): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    status.value = await nodeStatus()
    statusError.value = null
  } catch (err) {
    statusError.value = message(err)
  }
  try {
    logs.value = await nodeLogsTail(LOG_LINES)
    logsError.value = null
  } catch (err) {
    logsError.value = message(err)
  } finally {
    busy.value = false
  }
}

const { busy: refreshBusy, refresh: onRefresh } = useRefresh(refresh)
const spinning = computed(() => refreshBusy.value || busy.value)

let stopPoll: (() => void) | null = null
let unwake: (() => void) | null = null
onMounted(() => {
  void refresh()
  stopPoll = follow(refresh, () => POLL_IDLE_MS)
  unwake = onWake(() => void refresh())
})
onUnmounted(() => {
  stopPoll?.()
  unwake?.()
})

// The app is gone once the quit lands, so the button only returns on failure.
async function quit(): Promise<void> {
  quitting.value = true
  quitError.value = null
  try {
    await appQuit()
  } catch (err) {
    quitError.value = message(err)
    quitting.value = false
  }
}

const STATE_VARIANT = {
  running: 'success',
  starting: 'sky',
  stopped: 'outline',
  error: 'destructive',
} as const

// A node redeeming a code is between states, so it says what it is doing.
const badge = computed(() => {
  const current = status.value
  if (!current) return null
  if (current.enrolling) return { label: 'connecting', variant: 'sky' as const }
  return { label: current.state, variant: STATE_VARIANT[current.state] }
})

const facts = computed(() => {
  const current = status.value
  if (!current) return []
  const nodeId = identity.value?.nodeId ?? current.nodeId
  const realm = identity.value?.realm ?? current.realm
  const noNode = current.enrolling ? 'joining the realm' : 'not set up'
  return [
    { label: 'Node', value: nodeId ? truncateMiddle(nodeId, 10, 6) : noNode },
    { label: 'Realm', value: realm ? truncateMiddle(realm, 10, 6) : 'n/a' },
    { label: 'Local API', value: current.apiBaseUrl ?? 'n/a' },
    { label: 'Version', value: current.version ?? 'n/a' },
    {
      label: 'Uptime',
      value: current.uptimeSeconds == null ? 'n/a' : formatDuration(current.uptimeSeconds * 1000),
    },
  ]
})
</script>

<template>
  <div class="space-y-4">
    <div class="surface p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h3 class="font-display text-sm font-semibold text-aruna-navy">This device's node</h3>
          <p class="mt-1 text-xs text-muted-foreground">
            The node runs inside Aruna Desktop. It holds your own data and never stores realm replicas for others.
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <Badge v-if="badge" :variant="badge.variant">{{ badge.label }}</Badge>
          <Button
            variant="outline"
            size="sm"
            :disabled="spinning"
            :aria-busy="spinning"
            aria-label="Refresh node status"
            @click="onRefresh"
          >
            <RefreshCw class="h-3.5 w-3.5" :class="spinning ? 'animate-spin' : ''" />
          </Button>
          <Button variant="outline" size="sm" :disabled="quitting" @click="quit">
            <Power class="h-3.5 w-3.5" /> {{ quitting ? 'Quitting' : 'Quit' }}
          </Button>
        </div>
      </div>

      <p
        v-if="quitError"
        class="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
      >
        {{ quitError }}
      </p>
      <p
        v-if="statusError"
        class="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
      >
        {{ statusError }}
      </p>
      <template v-else-if="status">
        <dl class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div v-for="fact in facts" :key="fact.label" class="min-w-0">
            <dt class="text-[11px] uppercase tracking-wider text-muted-foreground">{{ fact.label }}</dt>
            <dd class="truncate font-mono text-xs text-foreground/90">{{ fact.value }}</dd>
          </div>
        </dl>
        <p v-if="status.message" class="mt-3 text-xs text-muted-foreground">{{ status.message }}</p>
        <p v-if="identityError" class="mt-3 text-xs text-muted-foreground">
          The node did not name itself: {{ identityError }}
        </p>
        <p v-if="status.enrolling" class="mt-3 text-xs text-muted-foreground">
          Connecting to the realm with the enrollment code.
        </p>
        <p v-else-if="!status.enrolled" class="mt-3 text-xs text-muted-foreground">
          This node is not enrolled in a realm yet. Open Enroll and paste the code from the portal.
        </p>
      </template>
    </div>

    <div class="surface p-5">
      <h3 class="font-display text-sm font-semibold text-aruna-navy">Recent log</h3>
      <p
        v-if="logsError"
        class="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
      >
        {{ logsError }}
      </p>
      <pre
        v-else-if="logs.length"
        class="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/40 px-3 py-2 font-mono text-[11px] leading-5 text-foreground/90"
        >{{ logs.join('\n') }}</pre
      >
      <p v-else class="mt-3 text-xs text-muted-foreground">The node has written no log lines yet.</p>
    </div>
  </div>
</template>
