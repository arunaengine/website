<script setup lang="ts">
// Supervisor view of the node Aruna Desktop embeds. Everything here comes from
// the shell bridge, so a command the shell does not implement is reported as
// such instead of rendering an invented status.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import DetailList from '@/components/ui/DetailList.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import Notice from '@/components/ui/Notice.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { useRefresh } from '@/composables/useRefresh'
import { appQuit, nodeLogsTail, nodeStatus, type NodeStatus } from '@/lib/desktopBridge'
import { follow, onWake, POLL_IDLE_MS } from '@/lib/poll'
import { toneVariant, type StateTone } from '@/lib/stateBadge'
import { errorMessage, formatDuration, truncateMiddle } from '@/lib/utils'
import { Power } from '@lucide/vue'

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

async function refresh(): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    status.value = await nodeStatus()
    statusError.value = null
  } catch (err) {
    statusError.value = errorMessage(err)
  }
  try {
    logs.value = await nodeLogsTail(LOG_LINES)
    logsError.value = null
  } catch (err) {
    logsError.value = errorMessage(err)
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
    quitError.value = errorMessage(err)
    quitting.value = false
  }
}

// A running node is settled, not in flight, so it does not share the tone a
// running job wears.
const STATE_TONE: Record<NodeStatus['state'], StateTone> = {
  running: 'done',
  starting: 'progress',
  stopped: 'idle',
  error: 'failed',
}

// A node redeeming a code is between states, so it says what it is doing.
const badge = computed(() => {
  const current = status.value
  if (!current) return null
  if (current.enrolling) return { label: 'connecting', variant: toneVariant('progress') }
  return { label: current.state, variant: toneVariant(STATE_TONE[current.state]) }
})

const nodeId = computed(() => identity.value?.nodeId ?? status.value?.nodeId ?? null)

const details = computed(() => {
  const current = status.value
  if (!current) return []
  const realm = identity.value?.realm ?? current.realm
  const noNode = current.enrolling ? 'joining the realm' : 'not set up'
  return [
    { label: 'Node', value: nodeId.value ?? noNode },
    { label: 'Realm', value: realm ? truncateMiddle(realm, 10, 6) : 'n/a', mono: true },
    { label: 'Local API', value: current.apiBaseUrl ?? 'n/a', mono: true },
    { label: 'Version', value: current.version ?? 'n/a', mono: true },
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
          <h3 class="font-display text-sm font-semibold text-aruna-navy">This computer's node</h3>
          <p class="mt-1 text-xs text-muted-foreground">
            The node runs inside Aruna Desktop. It holds your own data and never stores realm replicas for others.
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <Badge v-if="badge" :variant="badge.variant">{{ badge.label }}</Badge>
          <RefreshButton :busy="spinning" sr-label="Refresh node status" @click="onRefresh" />
          <Button variant="outline" size="sm" :disabled="quitting" @click="quit">
            <Power class="h-3.5 w-3.5" /> {{ quitting ? 'Quitting' : 'Quit' }}
          </Button>
        </div>
      </div>

      <Notice v-if="quitError" tone="error" class="mt-4">{{ quitError }}</Notice>
      <Notice v-if="statusError" tone="error" class="mt-4">{{ statusError }}</Notice>
      <template v-else-if="status">
        <DetailList :items="details" class="mt-4 lg:grid-cols-3">
          <template v-if="nodeId" #Node><NodeLabel :node-id="nodeId" /></template>
        </DetailList>
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
      <Notice v-if="logsError" tone="error" class="mt-3">{{ logsError }}</Notice>
      <pre
        v-else-if="logs.length"
        class="surface-muted mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-all px-3 py-2 font-mono text-[11px] leading-5 text-foreground/90"
        >{{ logs.join('\n') }}</pre
      >
      <p v-else class="mt-3 text-xs text-muted-foreground">The node has written no log lines yet.</p>
    </div>
  </div>
</template>
