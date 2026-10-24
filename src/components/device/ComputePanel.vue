<script setup lang="ts">
// Whether this computer runs jobs itself and how much of it they may take. The
// probe is what the shell found; the settings are what the owner decided, and
// saving them restarts the node.
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import Input from '@/components/ui/Input.vue'
import Switch from '@/components/ui/Switch.vue'
import { useDeviceCompute } from '@/composables/useDeviceCompute'
import {
  computeProbe,
  nodeSettings,
  setNodeSettings,
  type ComputeProbe,
  type ComputeSettings,
} from '@/lib/desktopBridge'
import { errorMessage } from '@/lib/utils'
import { Cpu } from '@lucide/vue'

const GIB = 1024 ** 3

const { compute, load: loadLive } = useDeviceCompute()

const settings = ref<ComputeSettings | null>(null)
const probe = ref<ComputeProbe | null>(null)
const loadError = ref<string | null>(null)
const saveError = ref<string | null>(null)
const saved = ref(false)
const saving = ref(false)

async function load(): Promise<void> {
  try {
    settings.value = (await nodeSettings()).compute
    loadError.value = null
  } catch (err) {
    loadError.value = errorMessage(err)
  }
}

// A probe that fails only costs the hint below; the settings still work.
async function runProbe(): Promise<void> {
  try {
    probe.value = await computeProbe()
  } catch {
    probe.value = null
  }
}

onMounted(() => {
  void load()
  void runProbe()
  void loadLive()
})

// Turning runs on lets the shell pick the runtime; the last choice is kept otherwise.
const on = computed(() => settings.value !== null && settings.value.backend !== 'off')

function setOn(enabled: boolean): void {
  patch({ backend: enabled ? 'auto' : 'off' })
}

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
    saveError.value = errorMessage(err)
  } finally {
    saving.value = false
  }
}

// What Automatic would pick right now, so the choice is not a guess.
const resolved = computed(() => {
  if (!probe.value) return null
  if (probe.value.docker.available) return 'Docker'
  // The shell only picks Apptainer when it has a delegated cgroup.
  if (probe.value.apptainer.available && probe.value.apptainer.cgroupOk) return 'Apptainer'
  return null
})

const chosenMissing = computed(() => {
  const backend = settings.value?.backend
  if (!probe.value || !backend || backend === 'off') return null
  if (backend === 'docker' && !probe.value.docker.available) return 'Docker is unreachable on this computer.'
  if (backend === 'apptainer' && !probe.value.apptainer.available) return 'Apptainer is not installed on this computer.'
  if (backend === 'apptainer' && !probe.value.apptainer.cgroupOk) return 'Apptainer has no delegated cgroup on this computer.'
  if (backend === 'auto' && !resolved.value) return 'No usable Docker or Apptainer was found on this computer.'
  return null
})
</script>

<template>
  <section class="surface overflow-hidden">
    <header class="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
      <div class="flex items-center gap-2">
        <Cpu class="h-4 w-4 text-primary" />
        <h2 class="font-display text-sm font-semibold text-aruna-navy">Local runs</h2>
      </div>
      <Badge v-if="compute?.enabled" variant="success">On</Badge>
      <Badge v-else variant="secondary">Off</Badge>
    </header>

    <div class="space-y-5 px-5 py-4">
      <Notice v-if="loadError" tone="error">{{ loadError }}</Notice>

      <template v-else-if="settings">
        <div class="flex items-center justify-between gap-3">
          <div>
            <span class="text-xs font-medium text-foreground">Run jobs on this computer</span>
            <p class="text-[11px] text-muted-foreground">
              Jobs run next to your data. Aruna never sends work here on its own.
            </p>
          </div>
          <Switch :checked="on" aria-label="Run jobs on this computer" @update:checked="setOn" />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <label class="block">
            <span class="text-xs font-medium text-foreground">Jobs at a time</span>
            <Input
              :model-value="numberInput(settings.maxConcurrent)"
              class="mt-1"
              type="number"
              min="1"
              placeholder="1"
              aria-label="Jobs at a time"
              @update:model-value="patchNumber('maxConcurrent', String($event))"
            />
          </label>
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
            <span class="text-xs font-medium text-foreground">Keep failed jobs</span>
            <p class="text-[11px] text-muted-foreground">
              Leave the files of a failed job on disk so you can look at them.
            </p>
          </div>
          <Switch
            :checked="settings.keepFailed"
            aria-label="Keep the files of failed jobs"
            @update:checked="patch({ keepFailed: $event })"
          />
        </div>

        <Notice v-if="on && chosenMissing" tone="warning">
          {{ chosenMissing }} Jobs sent here are refused until it is available.
        </Notice>

        <Notice v-if="saveError" tone="error">{{ saveError }}</Notice>

        <p class="text-[11px] text-muted-foreground">Saving restarts Aruna on this computer for a few seconds.</p>
        <div class="flex flex-wrap items-center gap-3">
          <Button :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Save' }}</Button>
          <span v-if="saved" class="text-[11px] text-muted-foreground">Saved.</span>
          <RouterLink :to="{ name: 'compute' }" class="ml-auto text-xs font-medium text-primary hover:underline">
            See runs in Compute
          </RouterLink>
        </div>
      </template>
    </div>
  </section>
</template>
