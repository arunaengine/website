<script setup lang="ts">
// What the dataset editor adds on its own when this file joins a dataset: where it came from
// (isBasedOn, or a run link) and the linked datasets it is part of (isPartOf).
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import type { PartOf } from '@/composables/useMockDatabases'
import { basedOn, type BasedOn, type Origin } from '@/lib/distributedMockData'

const props = defineProps<{ origin: Origin; partOf: PartOf[] }>()

const removed = ref<string[]>([])
const all = computed<BasedOn[]>(() => [
  ...basedOn(props.origin),
  ...props.partOf.map((item) => ({
    label: item.dataset.name,
    value: `https://w3id.org/aruna/${item.dataset.id}`,
    property: 'isPartOf' as const,
  })),
])
const entries = computed(() => all.value.filter((entry) => !removed.value.includes(entry.value)))
</script>

<template>
  <div class="space-y-1.5">
    <p v-if="!all.length" class="text-muted-foreground">
      {{ origin.kind === 'storage' ? 'Nothing is added (the storage folder stays private).' : 'Nothing is added: this file was uploaded directly.' }}
    </p>
    <ul v-else class="space-y-1">
      <li v-for="entry in entries" :key="entry.value" class="flex items-center gap-2">
        <template v-if="entry.property === 'run'">
          <span class="min-w-0 flex-1">
            Produced by run
            <RouterLink :to="{ name: 'compute', query: { tab: 'jobs' } }" class="font-mono text-primary hover:underline">{{ entry.value }}</RouterLink>
            (CreateAction result), a run link
          </span>
        </template>
        <template v-else>
          <span class="shrink-0 text-muted-foreground">{{ entry.property }}</span>
          <span class="min-w-0 flex-1 break-all font-mono">{{ entry.value }}</span>
        </template>
        <Button size="sm" variant="ghost" :aria-label="`Remove ${entry.label}`" @click="removed.push(entry.value)">Remove</Button>
      </li>
      <li v-if="!entries.length" class="text-muted-foreground">Removed. The dataset will not point to the origin of this file.</li>
    </ul>
  </div>
</template>
