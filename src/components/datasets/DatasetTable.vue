<script setup lang="ts">
// The catalog as table rows: favourite, title with a one-line description, author, keywords,
// profile and the date of the last change.
import { RouterLink } from 'vue-router'
import { Star } from '@lucide/vue'
import ProfileChip from '@/components/metadata/ProfileChip.vue'
import type { MetadataDoc } from '@/data/types'

defineProps<{
  docs: MetadataDoc[]
  canFavourite: boolean
  isFavourite: (id: string) => boolean
  busy: ReadonlySet<string>
}>()
const emit = defineEmits<{ (e: 'toggle-favourite', id: string): void }>()
</script>

<template>
  <div class="surface overflow-x-auto">
    <table class="w-full text-left text-xs">
      <thead class="border-b border-border text-muted-foreground">
        <tr>
          <th v-if="canFavourite" class="w-8 px-3 py-2"><span class="sr-only">Favourite</span></th>
          <th class="px-3 py-2 font-medium">Title</th>
          <th class="px-3 py-2 font-medium">Author</th>
          <th class="px-3 py-2 font-medium">Keywords</th>
          <th class="px-3 py-2 font-medium">Profile</th>
          <th class="px-3 py-2 font-medium">Updated</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border">
        <tr v-for="doc in docs" :key="doc.ulid" class="hover:bg-muted/40">
          <td v-if="canFavourite" class="px-3 py-2.5 text-center">
            <button
              type="button"
              class="rounded-md p-1 transition-colors hover:bg-muted disabled:opacity-50"
              :class="isFavourite(doc.ulid) ? 'text-aruna-royal dark:text-aruna-aqua' : 'text-muted-foreground'"
              :disabled="busy.has(doc.ulid)"
              :aria-label="isFavourite(doc.ulid) ? 'Remove from favourites' : 'Add to favourites'"
              @click="emit('toggle-favourite', doc.ulid)"
            >
              <Star class="h-3.5 w-3.5" :fill="isFavourite(doc.ulid) ? 'currentColor' : 'none'" />
            </button>
          </td>
          <td class="max-w-[28rem] px-3 py-2.5">
            <RouterLink :to="{ name: 'dataset', params: { id: doc.ulid } }" class="font-medium text-aruna-navy hover:underline">
              {{ doc.title }}
            </RouterLink>
            <div class="truncate text-[11px] text-muted-foreground">{{ doc.description || doc.ulid }}</div>
          </td>
          <td class="px-3 py-2.5 text-foreground/80">{{ doc.author }}</td>
          <td class="px-3 py-2.5">
            <span
              v-for="keyword in doc.keywords.slice(0, 3)"
              :key="keyword"
              class="mr-1 inline-block rounded-full border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] text-foreground/70"
            >#{{ keyword }}</span>
          </td>
          <td class="px-3 py-2.5"><ProfileChip :doc="doc" /></td>
          <td class="whitespace-nowrap px-3 py-2.5 tabular-nums text-muted-foreground" :title="doc.updatedAt">{{ doc.updatedAt.slice(0, 10) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
