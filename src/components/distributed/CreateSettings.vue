<script setup lang="ts">
// Key ranges, refresh, range requests and search for a bucket stored on several nodes.
import { computed } from 'vue'
import Input from '@/components/ui/Input.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import OptionToggle from '@/components/ui/OptionToggle.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import Textarea from '@/components/ui/Textarea.vue'
import {
  planRanges,
  RANGE_MODES,
  rangeTotal,
  REFRESH_OPTIONS,
  splitKeys,
  type CreateSettings,
  type PresetId,
  type RangeMode,
} from '@/lib/distributedMock'
import { formatNumber } from '@/lib/utils'

const props = defineProps<{ modelValue: CreateSettings; preset: PresetId; nodeIds: string[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: CreateSettings): void }>()

const modeOptions = RANGE_MODES.map(({ value, label }) => ({ value, label }))

const sharded = computed(() => props.preset.startsWith('sharding'))
const total = computed(() => rangeTotal(props.modelValue))
const replicas = computed(() => props.preset === 'sharding-replicas')
const preview = computed(() => planRanges(Math.min(total.value, 6), props.nodeIds, replicas.value))
const starts = computed(() => ['(start)', ...splitKeys(props.modelValue)])
const modeHint = computed(() => RANGE_MODES.find((mode) => mode.value === props.modelValue.mode)?.hint)

function set<K extends keyof CreateSettings>(key: K, value: CreateSettings[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
</script>

<template>
  <div class="space-y-5">
    <section class="space-y-3">
      <h3 class="text-sm font-medium text-foreground">Ranges</h3>
      <p v-if="!sharded" class="text-xs text-muted-foreground">
        This preset uses one range for the whole bucket. The first node that keeps copies is its only coordinator.
      </p>
      <template v-else>
        <Textarea
          :model-value="modelValue.keys"
          rows="4"
          class="max-w-xl text-xs"
          placeholder="One split key per line, in order, for example&#10;genomes/m&#10;genomes/t"
          aria-label="Split keys"
          @update:model-value="set('keys', $event)"
        />
        <p class="text-xs text-muted-foreground">
          {{ formatNumber(total) }} {{ total === 1 ? 'range' : 'ranges' }} (at most 4096). Each key starts a new range.
          A range can split later.
        </p>
        <table v-if="preview.length" class="w-full max-w-2xl text-left text-xs">
          <thead class="border-b border-border text-muted-foreground">
            <tr>
              <th class="py-1 pr-3 font-medium">Range</th>
              <th class="py-1 pr-3 font-medium">Starts at</th>
              <th class="py-1 pr-3 font-medium">Coordinator</th>
              <th v-if="replicas" class="py-1 font-medium">Copy</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr v-for="(range, index) in preview" :key="range.id">
              <td class="py-1 pr-3 font-mono">{{ range.id }}</td>
              <td class="py-1 pr-3 font-mono">{{ starts[index] }}</td>
              <td class="py-1 pr-3"><NodeLabel :node-id="range.coordinator" /></td>
              <td v-if="replicas" class="py-1"><NodeLabel v-if="range.replica" :node-id="range.replica" /></td>
            </tr>
          </tbody>
        </table>
        <p v-if="total > preview.length" class="text-xs text-muted-foreground">and {{ formatNumber(total - preview.length) }} more</p>
      </template>
    </section>

    <section class="space-y-4">
      <h3 class="text-sm font-medium text-foreground">Reads and updates</h3>
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
          <p class="text-xs text-muted-foreground">{{ modeHint }}</p>
        </div>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="space-y-1">
          <label class="text-xs font-medium text-foreground" for="dm-split-objects">Split a range above (files)</label>
          <Input id="dm-split-objects" :model-value="modelValue.splitObjects" inputmode="numeric" placeholder="Never" @update:model-value="set('splitObjects', String($event))" />
        </div>
        <div class="space-y-1">
          <label class="text-xs font-medium text-foreground" for="dm-split-bytes">Split a range above (bytes)</label>
          <Input id="dm-split-bytes" :model-value="modelValue.splitBytes" inputmode="numeric" placeholder="Never" @update:model-value="set('splitBytes', String($event))" />
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
