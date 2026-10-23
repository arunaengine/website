<script setup lang="ts">
// Key ranges, refresh, range requests and search for a new distributed bucket.
import { computed } from 'vue'
import Input from '@/components/ui/Input.vue'
import OptionToggle from '@/components/ui/OptionToggle.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import Textarea from '@/components/ui/Textarea.vue'
import {
  plannedStart,
  planRanges,
  presetById,
  RANGE_MODES,
  rangeTotal,
  REFRESH_OPTIONS,
  type CreateSettings,
  type HintKind,
  type PresetId,
  type RangeMode,
} from '@/lib/distributedMock'
import { formatNumber } from '@/lib/utils'

const props = defineProps<{ modelValue: CreateSettings; preset: PresetId; nodeIds: string[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: CreateSettings): void }>()

const HINTS = [
  { value: 'count', label: 'Range count' },
  { value: 'keys', label: 'Explicit keys' },
  { value: 'import', label: 'From import source' },
]
const modeOptions = RANGE_MODES.map(({ value, label }) => ({ value, label }))

const single = computed(() => presetById(props.preset).ranges === 1)
const total = computed(() => rangeTotal(props.modelValue))
const replicas = computed(() => props.preset === 'sharding-replicas')
const preview = computed(() => planRanges(Math.min(total.value, 6), props.nodeIds, replicas.value))
const modeHint = computed(() => RANGE_MODES.find((mode) => mode.value === props.modelValue.mode)?.hint)

function set<K extends keyof CreateSettings>(key: K, value: CreateSettings[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
</script>

<template>
  <div class="space-y-5">
    <section class="surface space-y-3 p-5">
      <h2 class="font-display text-base font-semibold text-aruna-navy">Key ranges</h2>
      <p v-if="single" class="text-xs text-muted-foreground">
        This preset uses one range for the whole bucket. {{ nodeIds[0] }} is its only coordinator.
      </p>
      <template v-else>
        <OptionToggle :model-value="modelValue.hint" :options="HINTS" aria-label="Range hint" @update:model-value="set('hint', $event as HintKind)" />
        <div v-if="modelValue.hint === 'count'" class="grid max-w-xl gap-3 sm:grid-cols-[8rem_1fr]">
          <Input :model-value="modelValue.count" type="number" min="1" max="4096" aria-label="Range count" @update:model-value="set('count', Number($event))" />
          <Input :model-value="modelValue.layout" placeholder="Key layout, for example year/month/sample" aria-label="Key layout" @update:model-value="set('layout', String($event))" />
        </div>
        <Textarea
          v-else-if="modelValue.hint === 'keys'"
          :model-value="modelValue.keys"
          rows="4"
          class="max-w-xl text-xs"
          placeholder="One split key per line, for example&#10;genomes/m&#10;genomes/t"
          aria-label="Split keys"
          @update:model-value="set('keys', $event)"
        />
        <p v-else class="text-xs text-muted-foreground">
          Each source bucket of the registered collection becomes one range. See Register a collection.
        </p>
        <p class="text-xs text-muted-foreground">
          {{ formatNumber(total) }} {{ total === 1 ? 'range' : 'ranges' }} (at most 4096).
          Ranges are cut at folder boundaries where possible, and a range can split later.
        </p>
        <table class="w-full max-w-2xl text-left text-xs">
          <thead class="border-b border-border text-muted-foreground">
            <tr>
              <th class="py-1 pr-3 font-medium">Range</th>
              <th class="py-1 pr-3 font-medium">Starts at</th>
              <th class="py-1 pr-3 font-medium">Coordinator</th>
              <th v-if="replicas" class="py-1 font-medium">Replica</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr v-for="(range, index) in preview" :key="range.id">
              <td class="py-1 pr-3 font-mono">{{ range.id }}</td>
              <td class="py-1 pr-3 font-mono">{{ plannedStart(modelValue, index) }}</td>
              <td class="py-1 pr-3">{{ range.coordinator }}</td>
              <td v-if="replicas" class="py-1">{{ range.replica ?? 'none' }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="total > preview.length" class="text-xs text-muted-foreground">and {{ formatNumber(total - preview.length) }} more</p>
      </template>
    </section>

    <section class="surface space-y-4 p-5">
      <h2 class="font-display text-base font-semibold text-aruna-navy">Reads and updates</h2>
      <div class="grid gap-4 md:grid-cols-2">
        <div class="space-y-1">
          <label class="text-xs font-medium text-foreground" for="dm-refresh">Check external sources</label>
          <Select id="dm-refresh" :model-value="modelValue.refresh" :options="REFRESH_OPTIONS" aria-label="Refresh interval" @update:model-value="set('refresh', $event)" />
          <p class="text-xs text-muted-foreground">
            Only the coordinator checks a source. Reads never do. Not meant for sets that change quickly.
          </p>
        </div>
        <div class="space-y-1">
          <span class="text-xs font-medium text-foreground">Range requests</span>
          <OptionToggle :model-value="modelValue.mode" :options="modeOptions" aria-label="Range request behaviour" @update:model-value="set('mode', $event as RangeMode)" />
          <p class="text-xs text-muted-foreground">{{ modeHint }} Each member can override this later.</p>
        </div>
      </div>
      <label class="flex items-start gap-3 text-sm">
        <Switch :checked="modelValue.index" aria-label="Search index" @update:checked="set('index', $event)" />
        <span>
          <span class="font-medium text-foreground">Search index</span>
          <span class="block text-xs text-muted-foreground">Lets people search file names. Each range keeps its own index on the nodes that hold its records.</span>
        </span>
      </label>
    </section>
  </div>
</template>
