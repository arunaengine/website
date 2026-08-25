<script setup lang="ts">
// Whether this machine runs jobs itself, with which runtime, and how much of
// the machine they may take. The probe is what the shell found; the settings
// are what the owner decided, and saving them restarts the node.
import { computed, onMounted, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import { useDeviceCompute } from '@/composables/useDeviceCompute'
import {
  computeProbe,
  nodeSettings,
  setNodeSettings,
  type ComputeProbe,
  type ComputeSettings,
} from '@/lib/desktopBridge'
import { formatBytes } from '@/lib/utils'
import { RefreshCw } from '@lucide/vue'

const GIB = 1024 ** 3

const { compute, state: liveState, load: loadLive } = useDeviceCompute()

const settings = ref<ComputeSettings | null>(null)
const probe = ref<ComputeProbe | null>(null)
const loadError = ref<string | null>(null)
const probeError = ref<string | null>(null)
const saveError = ref<string | null>(null)
const saved = ref(false)
const saving = ref(false)
const probing = ref(false)

const BACKEND_OPTIONS = [
  { value: 'auto', label: 'Automatic' },
  { value: 'docker', label: 'Docker' },
  { value: 'apptainer', label: 'Apptainer' },
  { value: 'off', label: 'Off' },
]

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function load(): Promise<void> {
  try {
    settings.value = (await nodeSettings()).compute
    loadError.value = null
  } catch (err) {
    loadError.value = message(err)
  }
}

async function runProbe(): Promise<void> {
  probing.value = true
  try {
    probe.value = await computeProbe()
    probeError.value = null
  } catch (err) {
    probeError.value = message(err)
  } finally {
    probing.value = false
  }
}

onMounted(() => {
  void load()
  void runProbe()
  void loadLive()
})

function patch(change: Partial<ComputeSettings>): void {
  if (!settings.value) return
  settings.value = { ...settings.value, ...change }
  saved.value = false
}

// Empty means "no ceiling of mine": the node keeps its own default.
function numberInput(value: number | null, factor = 1): string {
  return value === null ? '' : String(value / factor)
}

function patchNumber(key: keyof ComputeSettings, raw: string, factor = 1): void {
  const parsed = Number(raw)
  const value = raw.trim() === '' || !Number.isFinite(parsed) || parsed <= 0 ? null : parsed * factor
  patch({ [key]: value } as Partial<ComputeSettings>)
}

async function save(): Promise<void> {
  if (!settings.value || saving.value) return
  saving.value = true
  saveError.value = null
  try {
    settings.value = (await setNodeSettings({ compute: settings.value })).compute
    saved.value = true
    await loadLive()
  } catch (err) {
    saveError.value = message(err)
  } finally {
    saving.value = false
  }
}

// What Automatic would pick right now, so the choice is not a guess.
const resolved = computed(() => {
  if (!probe.value) return null
  if (probe.value.docker.available) return 'Docker'
  if (probe.value.apptainer.available) return 'Apptainer'
  return null
})

const chosenMissing = computed(() => {
  const backend = settings.value?.backend
  if (!probe.value || !backend || backend === 'off') return null
  if (backend === 'docker' && !probe.value.docker.available) return 'Docker is not answering on this machine.'
  if (backend === 'apptainer' && !probe.value.apptainer.available) return 'Apptainer is not installed on this machine.'
  if (backend === 'auto' && !resolved.value) return 'Neither Docker nor Apptainer was found on this machine.'
  return null
})
</script>

<template>
  <div class="space-y-4">
    <div class="surface space-y-5 p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 class="font-display text-sm font-semibold text-aruna-navy">Run jobs on this computer</h3>
          <p class="mt-1 text-xs text-muted-foreground">
            Jobs you send to This computer run in a container here, against data this node already holds. The realm
            never sends work to this machine.
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <Badge v-if="compute?.enabled" variant="success">on</Badge>
          <Badge v-else variant="secondary">off</Badge>
          <Button variant="outline" size="sm" :disabled="probing" aria-label="Look for a runtime again" @click="runProbe">
            <RefreshCw class="h-3.5 w-3.5" :class="probing ? 'animate-spin' : ''" />
          </Button>
        </div>
      </div>

      <p
        v-if="loadError"
        class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
      >
        {{ loadError }}
      </p>

      <template v-else-if="settings">
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="text-xs font-medium text-foreground">Container runtime</span>
            <Select
              :model-value="settings.backend"
              class="mt-1"
              :options="BACKEND_OPTIONS"
              aria-label="Container runtime"
              @update:model-value="patch({ backend: $event as ComputeSettings['backend'] })"
            />
            <span v-if="settings.backend === 'auto' && resolved" class="mt-1 block text-[11px] text-muted-foreground"
              >Automatic picks {{ resolved }} on this machine.</span
            >
          </label>
          <label class="block">
            <span class="text-xs font-medium text-foreground">Runs at a time</span>
            <Input
              :model-value="numberInput(settings.maxConcurrent)"
              class="mt-1"
              type="number"
              min="1"
              placeholder="1"
              aria-label="Runs at a time"
              @update:model-value="patchNumber('maxConcurrent', String($event))"
            />
          </label>
        </div>

        <div class="grid gap-3 sm:grid-cols-3">
          <label class="block">
            <span class="text-xs font-medium text-foreground">CPU cores</span>
            <Input
              :model-value="numberInput(settings.maxCpuCores)"
              class="mt-1"
              type="number"
              min="1"
              placeholder="no limit"
              aria-label="Maximum CPU cores"
              @update:model-value="patchNumber('maxCpuCores', String($event))"
            />
          </label>
          <label class="block">
            <span class="text-xs font-medium text-foreground">Memory (GB)</span>
            <Input
              :model-value="numberInput(settings.maxRamBytes, GIB)"
              class="mt-1"
              type="number"
              min="1"
              placeholder="no limit"
              aria-label="Maximum memory in gigabytes"
              @update:model-value="patchNumber('maxRamBytes', String($event), GIB)"
            />
          </label>
          <label class="block">
            <span class="text-xs font-medium text-foreground">Disk (GB)</span>
            <Input
              :model-value="numberInput(settings.maxDiskBytes, GIB)"
              class="mt-1"
              type="number"
              min="1"
              placeholder="no limit"
              aria-label="Maximum disk in gigabytes"
              @update:model-value="patchNumber('maxDiskBytes', String($event), GIB)"
            />
          </label>
        </div>

        <div class="flex items-center justify-between gap-3">
          <div>
            <span class="text-xs font-medium text-foreground">Keep failed runs</span>
            <p class="text-[11px] text-muted-foreground">
              Leaves the workspace of a failed run on disk so you can look at what it produced.
            </p>
          </div>
          <Switch
            :checked="settings.keepFailed"
            aria-label="Keep the workspace of failed runs"
            @update:checked="patch({ keepFailed: $event })"
          />
        </div>

        <p
          v-if="chosenMissing"
          class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
        >
          {{ chosenMissing }} Runs sent here will be refused until it is available.
        </p>

        <p
          v-if="saveError"
          class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          {{ saveError }}
        </p>

        <div class="flex flex-wrap items-center justify-end gap-3">
          <span class="mr-auto text-[11px] text-muted-foreground">Saving restarts the node on this machine.</span>
          <span v-if="saved" class="text-[11px] text-muted-foreground">Saved.</span>
          <Button :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Save compute settings' }}</Button>
        </div>
      </template>
    </div>

    <div class="surface space-y-3 p-5">
      <h3 class="font-display text-sm font-semibold text-aruna-navy">What this machine offers</h3>
      <p v-if="probeError" class="text-xs text-muted-foreground">The shell could not look for a runtime: {{ probeError }}</p>
      <dl v-else-if="probe" class="grid gap-3 sm:grid-cols-2">
        <div class="rounded-md border border-border/70 px-3 py-2">
          <dt class="text-xs font-medium text-foreground">Docker</dt>
          <dd class="mt-0.5 font-mono text-[11px] text-muted-foreground">
            {{ probe.docker.available ? (probe.docker.version ?? 'available') : 'not answering' }}
          </dd>
          <dd v-if="probe.docker.socket" class="truncate font-mono text-[10px] text-muted-foreground">
            {{ probe.docker.socket }}
          </dd>
        </div>
        <div class="rounded-md border border-border/70 px-3 py-2">
          <dt class="text-xs font-medium text-foreground">Apptainer</dt>
          <dd class="mt-0.5 font-mono text-[11px] text-muted-foreground">
            {{ probe.apptainer.available ? (probe.apptainer.version ?? 'available') : 'not installed' }}
          </dd>
          <dd v-if="probe.apptainer.available && !probe.apptainer.cgroupOk" class="text-[10px] text-amber-700 dark:text-amber-300">
            No delegated cgroup, so resource limits will not hold.
          </dd>
        </div>
      </dl>

      <div v-if="liveState === 'ready' && compute" class="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-muted-foreground">
        <span>backend <span class="font-mono text-foreground">{{ compute.backend ?? 'none' }}</span></span>
        <span>health <span class="font-mono text-foreground">{{ compute.healthy ? 'ok' : 'not ready' }}</span></span>
        <span>running <span class="font-mono text-foreground">{{ compute.running }}</span></span>
        <span>queued <span class="font-mono text-foreground">{{ compute.queued }}</span></span>
        <span v-if="compute.limits.max_ram_bytes"
          >memory cap
          <span class="font-mono text-foreground">{{ formatBytes(compute.limits.max_ram_bytes) }}</span></span
        >
      </div>
      <p v-else-if="liveState === 'unsupported'" class="text-[11px] text-muted-foreground">
        This node version does not report its compute state yet.
      </p>
      <p v-else-if="liveState === 'offline'" class="text-[11px] text-muted-foreground">
        The node is not running, so it reports no compute state.
      </p>
    </div>
  </div>
</template>
