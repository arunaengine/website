<script setup lang="ts">
// One dataset as a list row: the type and the run outcome keep fixed columns on the right.
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import CrateTypeBadge from '@/components/datasets/CrateTypeBadge.vue'
import DatasetFactGrid from '@/components/datasets/DatasetFactGrid.vue'
import DatasetTile from '@/components/datasets/DatasetTile.vue'
import FavouriteStar from '@/components/datasets/FavouriteStar.vue'
import { useAruna } from '@/composables/useAruna'
import { crateTypeOf } from '@/lib/crateType'
import type { MetadataDoc } from '@/data/types'

const props = defineProps<{ doc: MetadataDoc; favourite?: boolean; busy?: boolean }>()
const emit = defineEmits<{ (e: 'toggle-favourite', id: string): void }>()

const { currentUser } = useAruna()
const type = computed(() => crateTypeOf(props.doc))
</script>

<template>
  <li class="surface relative grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 gap-y-2 p-4 transition-colors hover:border-primary/40 sm:grid-cols-[auto_minmax(0,1fr)_8rem_1.5rem_auto]">
    <DatasetTile :doc="doc" size="lg" />
    <div class="min-w-0 space-y-2">
      <RouterLink
        :to="{ name: 'dataset', params: { id: doc.ulid } }"
        class="block text-sm font-semibold text-foreground after:absolute after:inset-0 after:content-[''] hover:underline"
      >{{ doc.title }}</RouterLink>
      <p v-if="!type.endsWith('-run') && doc.description" class="line-clamp-2 text-sm text-muted-foreground">{{ doc.description }}</p>
      <div class="max-w-2xl"><DatasetFactGrid :doc="doc" /></div>
    </div>
    <div class="relative z-10 flex items-center gap-2 max-sm:col-start-2 max-sm:row-start-2 sm:items-start sm:pt-0.5">
      <CrateTypeBadge :type="type" part="type" />
      <span class="sm:hidden"><CrateTypeBadge :type="type" :crate="doc.roCrate" part="state" /></span>
    </div>
    <div class="relative z-10 pt-1 max-sm:hidden"><CrateTypeBadge :type="type" :crate="doc.roCrate" part="state" /></div>
    <div class="relative z-10 max-sm:col-start-3 max-sm:row-start-1">
      <FavouriteStar v-if="currentUser" :favourite="Boolean(favourite)" :busy="busy" @toggle="emit('toggle-favourite', doc.ulid)" />
    </div>
  </li>
</template>
