<script setup lang="ts">
// One dataset as a card: type tile, title, type pill and run outcome, star, description and facts.
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import CrateTypeBadge from '@/components/datasets/CrateTypeBadge.vue'
import DatasetFactGrid from '@/components/datasets/DatasetFactGrid.vue'
import DatasetTile from '@/components/datasets/DatasetTile.vue'
import FavouriteStar from '@/components/datasets/FavouriteStar.vue'
import { useAruna } from '@/composables/useAruna'
import { crateTypeOf } from '@/lib/crateType'
import type { MetadataDoc } from '@/data/types'

const props = defineProps<{
  doc: MetadataDoc
  score?: number
  favourite?: boolean
  busy?: boolean
}>()
const emit = defineEmits<{ (e: 'toggle-favourite', id: string): void }>()

const { currentUser } = useAruna()
const type = computed(() => crateTypeOf(props.doc))
</script>

<template>
  <div class="surface relative flex h-full min-w-0 flex-col gap-3 p-4 transition-colors hover:border-primary/40">
    <div class="flex items-start gap-3">
      <DatasetTile :doc="doc" />
      <RouterLink
        :to="{ name: 'dataset', params: { id: doc.ulid } }"
        class="line-clamp-3 min-w-0 flex-1 text-sm font-semibold text-foreground after:absolute after:inset-0 after:content-[''] hover:underline"
      >{{ doc.title }}</RouterLink>
      <div class="relative z-10 flex shrink-0 items-start gap-2">
        <span class="pt-1"><CrateTypeBadge :type="type" :crate="doc.roCrate" /></span>
        <FavouriteStar v-if="currentUser" :favourite="Boolean(favourite)" :busy="busy" @toggle="emit('toggle-favourite', doc.ulid)" />
      </div>
    </div>
    <p v-if="!type.endsWith('-run') && doc.description" class="line-clamp-2 text-sm text-muted-foreground">{{ doc.description }}</p>
    <Badge v-if="score !== undefined" variant="outline" size="sm" class="w-fit">Score {{ score.toFixed(2) }}</Badge>
    <div class="mt-auto"><DatasetFactGrid :doc="doc" /></div>
  </div>
</template>
