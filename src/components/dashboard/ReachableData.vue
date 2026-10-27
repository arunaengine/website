<script setup lang="ts">
// The data the caller can reach in their groups: what Aruna stores, what it references from outside
// sources, and both together. Each figure says when part of it is unknown instead of counting zero.
import { computed, watch } from 'vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useAruna } from '@/composables/useAruna'
import { useReachableUsage, type UsageSum } from '@/composables/useReachableUsage'
import { formatCount } from '@/lib/formatCount'
import { formatBytes } from '@/lib/utils'

const props = defineProps<{ refreshRevision: number }>()

const { myGroups } = useAruna()
const reach = useReachableUsage()

// A dashboard refresh reads every bucket again; other parts reuse what was read.
watch(
  () => [myGroups.value.map((group) => group.id).join(','), props.refreshRevision] as const,
  (next, previous) => void reach.load(Boolean(previous && next[1] !== previous[1])),
  { immediate: true },
)

// A figure is a lower bound when a bucket was not counted whole or a group was not read whole.
const failed = computed(() => reach.groups.value.filter((group) => group.error).map((group) => group.name))
const unlisted = computed(() => reach.groups.value.some((group) => group.error || group.missing))
const lower = (sum: UsageSum, missing = unlisted.value) => missing || sum.partial || sum.unread > 0
const bytes = (value: number, atLeast: boolean) => `${atLeast ? 'at least ' : ''}${formatBytes(value)}`

function figures(sum: UsageSum, missing?: boolean) {
  const atLeast = lower(sum, missing)
  const referencedLower = atLeast || sum.referencedUnknown > 0
  return {
    stored: bytes(sum.stored, atLeast),
    referenced: bytes(sum.referenced, referencedLower),
    total: bytes(sum.stored + sum.referenced, referencedLower),
    objects: `${atLeast ? 'at least ' : ''}${formatCount(sum.objects)}`,
  }
}

const total = computed(() => figures(reach.total.value))
const tiles = computed(() => [
  { key: 'stored', label: 'Stored', value: total.value.stored, hint: 'Data Aruna holds in its storage' },
  { key: 'referenced', label: 'Referenced', value: total.value.referenced, hint: 'Registered external data, read from its source' },
  { key: 'total', label: 'Total', value: total.value.total, hint: `Stored and referenced, in ${total.value.objects} objects` },
])
const rows = computed(() => reach.groups.value.map((group) => ({ group, shown: figures(group, Boolean(group.error) || group.missing) })))
const missing = computed(() => reach.groups.value.filter((group) => group.missing && !group.error).map((group) => group.name))
const loaded = computed(() => reach.groups.value.length > 0)
</script>

<template>
  <section class="space-y-3.5" aria-labelledby="reachable-data-heading">
    <div>
      <h3 id="reachable-data-heading" class="font-display text-sm font-semibold text-aruna-navy">Data you can reach</h3>
      <p class="mt-0.5 text-xs text-muted-foreground">
        Summed over the buckets of your groups, on every node. A bucket stored on several nodes counts once.
      </p>
    </div>
    <div class="grid gap-3.5 sm:grid-cols-3">
      <template v-if="!loaded">
        <Skeleton v-for="n in 3" :key="n" class="h-[92px]" />
      </template>
      <div v-for="tile in loaded ? tiles : []" :key="tile.key" class="surface flex flex-col gap-1.5 p-4">
        <span class="text-xs font-medium uppercase tracking-wider text-muted-foreground">{{ tile.label }}</span>
        <span class="font-display text-2xl font-semibold text-aruna-navy">{{ tile.value }}</span>
        <span class="text-xs text-muted-foreground">{{ tile.hint }}</span>
      </div>
    </div>
    <div v-if="loaded" class="surface overflow-x-auto">
      <table class="w-full text-left text-xs">
        <thead class="border-b border-border text-muted-foreground">
          <tr>
            <th class="px-4 py-2 font-medium">Group</th>
            <th class="px-4 py-2 font-medium">Stored</th>
            <th class="px-4 py-2 font-medium">Referenced</th>
            <th class="px-4 py-2 font-medium">Total</th>
            <th class="px-4 py-2 font-medium">Objects</th>
            <th class="px-4 py-2 font-medium">Buckets</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          <tr v-for="{ group, shown } in rows" :key="group.groupId">
            <td class="px-4 py-2 font-medium text-foreground">{{ group.name }}</td>
            <template v-if="group.error">
              <td colspan="5" class="px-4 py-2 text-muted-foreground">Unknown: {{ group.error }}</td>
            </template>
            <template v-else>
              <td class="px-4 py-2 tabular-nums">{{ shown.stored }}</td>
              <td class="px-4 py-2 tabular-nums">{{ shown.referenced }}</td>
              <td class="px-4 py-2 tabular-nums">{{ shown.total }}</td>
              <td class="px-4 py-2 tabular-nums">{{ shown.objects }}</td>
              <td class="px-4 py-2 tabular-nums">{{ formatCount(group.buckets) }}</td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>
    <ul v-if="loaded" class="space-y-1 text-xs text-muted-foreground">
      <li v-if="reach.total.value.unread">
        The usage of {{ reach.total.value.unread }} {{ reach.total.value.unread === 1 ? 'bucket' : 'buckets' }} could not be read, so it is not counted.
      </li>
      <li v-if="reach.total.value.referencedUnknown">
        {{ reach.total.value.referencedUnknown }} {{ reach.total.value.referencedUnknown === 1 ? 'bucket does' : 'buckets do' }} not report
        referenced data, so the referenced size is unknown there.
      </li>
      <li v-if="reach.total.value.partial">Some buckets are still being counted, so their numbers are lower bounds.</li>
      <li v-if="missing.length">Buckets of {{ missing.join(', ') }} may be missing: a node did not answer or the list was too long.</li>
      <li v-if="failed.length">The buckets of {{ failed.join(', ') }} could not be listed.</li>
    </ul>
  </section>
</template>
