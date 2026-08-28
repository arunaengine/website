<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Star } from '@lucide/vue'
import Badge from '@/components/ui/Badge.vue'
import ProfileChip from '@/components/metadata/ProfileChip.vue'
import type { MetadataDoc } from '@/data/types'

const props = defineProps<{
  doc: MetadataDoc
  favourite?: boolean
  canFavourite?: boolean // signed-in gate; the view decides
  favouriteBusy?: boolean
  score?: number // rendered as a Badge when provided (search mode)
}>()
const emit = defineEmits<{ (e: 'toggle-favourite', id: string): void }>()
</script>

<template>
  <RouterLink
    :to="{ name: 'dataset', params: { id: props.doc.ulid } }"
    class="surface group relative flex h-full flex-col gap-3 p-4 transition-shadow hover:shadow-md"
  >
    <button
      v-if="props.canFavourite"
      type="button"
      class="absolute right-2.5 top-2.5 rounded-md p-1 transition-colors hover:bg-muted disabled:opacity-50"
      :class="props.favourite ? 'text-amber-500' : 'text-muted-foreground'"
      :disabled="props.favouriteBusy"
      :aria-label="props.favourite ? 'Remove from favourites' : 'Add to favourites'"
      @click.prevent.stop="emit('toggle-favourite', props.doc.ulid)"
    >
      <Star class="h-4 w-4" :fill="props.favourite ? 'currentColor' : 'none'" />
    </button>
    <div class="pr-6">
      <h3 class="font-display text-sm font-semibold text-aruna-navy">{{ props.doc.title }}</h3>
      <p class="mt-1 line-clamp-2 text-xs text-muted-foreground">{{ props.doc.description || props.doc.ulid }}</p>
    </div>
    <div class="flex flex-wrap gap-1">
      <span
        v-for="keyword in props.doc.keywords.slice(0, 4)"
        :key="keyword"
        class="rounded-full border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] text-foreground/70"
        >#{{ keyword }}</span
      >
    </div>
    <div class="mt-auto flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
      <span class="truncate">{{ props.doc.author || props.doc.ulid }}</span>
      <div class="flex shrink-0 items-center gap-1.5">
        <Badge v-if="props.score !== undefined" variant="outline" class="text-[10px]">score {{ props.score.toFixed(2) }}</Badge>
        <ProfileChip :doc="props.doc" />
      </div>
    </div>
  </RouterLink>
</template>
