<script setup lang="ts">
// The Datasets query box and its filter row. Both branches below it (browse and
// search) read the same refs, so this surface stays outside them.
import { computed, ref } from 'vue'
import Spinner from '@/components/ui/Spinner.vue'
import DatasetFilters from '@/components/datasets/DatasetFilters.vue'
import type { FilterModel } from '@/components/search/SearchFilterBar.vue'
import { Search } from '@lucide/vue'

const props = defineProps<{
  query: string
  filters: FilterModel
  groupOptions: Array<{ id: string; label: string }>
  busy: boolean
}>()
const emit = defineEmits<{
  (e: 'update:query', value: string): void
  (e: 'update:filters', value: FilterModel): void
}>()

const q = computed({ get: () => props.query, set: (value) => emit('update:query', value) })
const filterModel = computed({ get: () => props.filters, set: (value) => emit('update:filters', value) })

const searchBox = ref<HTMLInputElement | null>(null)
defineExpose({ focus: () => searchBox.value?.focus() })
</script>

<template>
  <div class="surface p-4">
    <div class="relative">
      <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input ref="searchBox" v-model="q" :aria-busy="busy" placeholder="Search datasets, data, groups, and users…" class="h-10 w-full rounded-md border border-input bg-background pl-9 pr-10 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring" />
      <Spinner v-if="busy" label="Searching…" class="absolute right-3 top-1/2 -translate-y-1/2 text-primary" />
    </div>
    <DatasetFilters v-model="filterModel" :group-options="groupOptions" class="mt-3" />
    <p class="mt-2 text-[11px] text-muted-foreground">
      Purpose classifies each RO-Crate as dataset, Profile, or Process Run. Profile and group filters are applied by the node.
    </p>
  </div>
</template>
