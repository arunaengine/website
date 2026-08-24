<script setup lang="ts">
// Supervisor view of the node Aruna Desktop embeds. Everything here comes from
// the shell bridge, so a command the shell does not implement is reported as
// such instead of rendering an invented status.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import { nodeLogsTail, nodeStatus, type NodeStatus } from '@/lib/desktopBridge'
import { formatDuration, truncateMiddle } from '@/lib/utils'
import { RefreshCw } from '@lucide/vue'

const POLL_MS = 5_000
const LOG_LINES = 200

const status = ref<NodeStatus | null>(null)
const logs = ref<string[]>([])
const statusError = ref<string | null>(null)
const logsError = ref<string | null>(null)
const busy = ref(false)

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function refresh(): Promise<void> {
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

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  void refresh()
  timer = setInterval(() => void refresh(), POLL_MS)
})
onUnmounted(() => clearInterval(timer))

const STATE_VARIANT = {
  running: 'success',
  starting: 'sky',
  stopped: 'outline',
  error: 'destructive',
} as const

const facts = computed(() => {
  const current = status.value
  if (!current) return []
  return [
    { label: 'Node', value: current.nodeId ? truncateMiddle(current.nodeId, 10, 6) : 'not enrolled yet' },
    { label: 'Realm', value: current.realm ? truncateMiddle(current.realm, 10, 6) : '—' },
    { label: 'Local API', value: current.apiBaseUrl ?? '—' },
    { label: 'Version', value: current.version ?? '—' },
    {
      label: 'Uptime',
      value: current.uptimeSeconds == null ? '—' : formatDuration(current.uptimeSeconds * 1000),
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
          <Badge v-if="status" :variant="STATE_VARIANT[status.state]">{{ status.state }}</Badge>
          <Button variant="outline" size="sm" :disabled="busy" aria-label="Refresh node status" @click="refresh">
            <RefreshCw class="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

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
        <p v-if="!status.enrolled" class="mt-3 text-xs text-muted-foreground">
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
        class="mt-3 max-h-80 overflow-auto whitespace-pre rounded-md bg-muted/40 px-3 py-2 font-mono text-[11px] leading-5 text-foreground/90"
        >{{ logs.join('\n') }}</pre
      >
      <p v-else class="mt-3 text-xs text-muted-foreground">The node has written no log lines yet.</p>
    </div>
  </div>
</template>
