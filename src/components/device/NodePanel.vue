<script setup lang="ts">
// State of Aruna on this computer, in plain words, with the two switches the
// shell offers: pause it, or start it again. The shell has no restart command,
// so there is no Restart button.
import { computed, onMounted, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { useNodeControl } from '@/composables/useNodeControl'
import { useRealm } from '@/composables/useRealm'
import { nodeSettings } from '@/lib/desktopBridge'
import { nodePill, plainDuration } from '@/lib/nodePill'
import { Pause, Play } from '@lucide/vue'

const { realm } = useRealm()
const { status, error: statusError } = useDeviceStatus()
const control = useNodeControl()
const paused = ref(false)

async function readPaused(): Promise<void> {
  try {
    paused.value = (await nodeSettings()).paused
  } catch {
    // Without settings a stop is told as a stop, never as a pause.
    paused.value = false
  }
}

onMounted(() => void readPaused())
// A pause or resume lands as a state change, so the flag is read again.
watch(() => status.value?.state, () => void readPaused())

const pill = computed(() => nodePill(status.value, paused.value))
const running = computed(() => pill.value.label === 'Running')
const canPause = computed(() => status.value !== null && status.value.state !== 'stopped' && status.value.state !== 'error')

const sentence = computed(() => {
  const current = status.value
  if (!current) return 'Looking for Aruna on this computer.'
  if (running.value) {
    const time = current.uptimeSeconds == null ? '' : `Aruna has run on this computer for ${plainDuration(current.uptimeSeconds)}. `
    return `${time}Syncing, tools and local runs are working.`
  }
  if (pill.value.label === 'Paused') return 'Aruna is paused. Syncing, tools and local runs wait until you resume it.'
  if (pill.value.label === 'Starting' || pill.value.label === 'Connecting') return 'Aruna is starting. This takes a few seconds.'
  return 'Aruna is not running. Syncing, tools and local runs wait until it runs again.'
})

const tiles = computed(() => [
  { label: 'Version', value: status.value?.version ?? 'n/a', mono: true },
  { label: 'Signed in to', value: realm.value.name, mono: false },
  {
    label: 'Running for',
    value: running.value && status.value?.uptimeSeconds != null ? plainDuration(status.value.uptimeSeconds) : 'n/a',
    mono: false,
  },
])

async function pause(): Promise<void> {
  await control.pause()
  await readPaused()
}

async function start(): Promise<void> {
  await control.start()
  await readPaused()
}
</script>

<template>
  <section class="surface overflow-hidden">
    <div class="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <h2 class="font-display text-sm font-semibold text-aruna-navy">Status</h2>
          <Badge :variant="pill.variant">{{ pill.label }}</Badge>
        </div>
        <p class="mt-1 text-xs text-muted-foreground">{{ sentence }}</p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <Button v-if="canPause" variant="outline" size="sm" :disabled="control.busy.value" @click="pause">
          <Pause class="h-3.5 w-3.5" /> Pause
        </Button>
        <Button v-else variant="outline" size="sm" :disabled="control.busy.value" @click="start">
          <Play class="h-3.5 w-3.5" /> {{ paused ? 'Resume' : 'Start' }}
        </Button>
      </div>
    </div>

    <div class="space-y-3 border-t border-border px-5 py-4">
      <Notice v-if="statusError" tone="error">{{ statusError }}</Notice>
      <Notice v-if="control.error.value" tone="error">{{ control.error.value }}</Notice>
      <Notice v-if="status?.message && !running && pill.label !== 'Paused'" tone="warning">{{ status.message }}</Notice>
      <Notice v-if="status && !status.enrolled && !status.enrolling" tone="info">
        This computer has not joined a realm yet.
      </Notice>
      <dl class="space-y-2 text-xs">
        <div v-for="tile in tiles" :key="tile.label" class="flex justify-between gap-3">
          <dt class="text-muted-foreground">{{ tile.label }}</dt>
          <dd :class="tile.mono ? 'font-mono' : ''" class="text-right text-foreground">{{ tile.value }}</dd>
        </div>
      </dl>
    </div>
  </section>
</template>
