<script setup lang="ts">
// The datasets as table rows with the same columns for every type: name, type, run outcome, license,
// makers, size when any row has one, and the last change. A value the summary lacks shows a dash.
import { computed, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import CrateTypeBadge from '@/components/datasets/CrateTypeBadge.vue'
import FavouriteStar from '@/components/datasets/FavouriteStar.vue'
import { useAruna } from '@/composables/useAruna'
import { useUserDirectory } from '@/composables/useUserDirectory'
import { crateTypeOf } from '@/lib/crateType'
import { datasetFacts, makersOf } from '@/lib/datasetFacts'
import type { MetadataDoc } from '@/data/types'
import { FileJson2, ListChecks, Play } from '@lucide/vue'

const props = defineProps<{
  docs: MetadataDoc[]
  canFavourite: boolean
  isFavourite: (id: string) => boolean
  busy: ReadonlySet<string>
}>()
const emit = defineEmits<{ (e: 'toggle-favourite', id: string): void }>()

const router = useRouter()
const { myGroups } = useAruna()
// A group the caller cannot name, such as every group for a visitor, is no raw id under By.
const groupName = (id: string) => myGroups.value.find((group) => group.id === id)?.name ?? ''
const userDir = useUserDirectory()
watch(() => props.docs.flatMap((doc) => makersOf(doc).flatMap((person) => person.userId ?? [])), (ids) => {
  if (ids.length) void userDir.resolveUsers(ids)
}, { immediate: true })
const personName = (id: string) => userDir.cachedUser(id)?.name ?? ''
const rows = computed(() =>
  props.docs.map((doc) => {
    const type = crateTypeOf(doc)
    const facts = Object.fromEntries(datasetFacts(doc, { group: groupName, person: personName }).map((fact) => [fact.label, fact]))
    return { doc, type, icon: type === 'profile' ? ListChecks : type.endsWith('-run') ? Play : FileJson2, facts }
  }),
)
const showSize = computed(() => rows.value.some((row) => row.facts.Size?.value))
</script>

<template>
  <div class="surface overflow-x-auto">
    <table class="w-full text-left text-sm">
      <thead class="border-b border-border text-xs text-muted-foreground">
        <tr>
          <th class="px-3 py-2 font-medium">Name</th>
          <th class="px-3 py-2 font-medium">Type</th>
          <th class="px-3 py-2 font-medium">Status</th>
          <th class="px-3 py-2 font-medium">License</th>
          <th class="px-3 py-2 font-medium">By</th>
          <th v-if="showSize" class="px-3 py-2 text-right font-medium">Size</th>
          <th class="px-3 py-2 font-medium">Updated</th>
          <th v-if="canFavourite" class="px-2 py-2"><span class="sr-only">Favourite</span></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.doc.ulid"
          class="cursor-pointer border-b border-border-subtle align-top last:border-0 hover:bg-muted/40"
          @click="router.push({ name: 'dataset', params: { id: row.doc.ulid } })"
        >
          <td class="px-3 py-2.5">
            <span class="flex items-start gap-2">
              <component :is="row.icon" class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <RouterLink :to="{ name: 'dataset', params: { id: row.doc.ulid } }" class="font-medium hover:underline" @click.stop>{{ row.doc.title }}</RouterLink>
            </span>
          </td>
          <td class="whitespace-nowrap px-3 py-2.5"><CrateTypeBadge :type="row.type" part="type" /></td>
          <td class="whitespace-nowrap px-3 py-2.5"><CrateTypeBadge :type="row.type" :crate="row.doc.roCrate" part="state" /></td>
          <td class="max-w-[12rem] truncate whitespace-nowrap px-3 py-2.5" :title="row.doc.license">{{ row.facts.License?.value || '-' }}</td>
          <td class="max-w-[12rem] truncate whitespace-nowrap px-3 py-2.5" :title="row.facts.By?.value">{{ row.facts.By?.value || '-' }}</td>
          <td v-if="showSize" class="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{{ row.facts.Size?.value || '-' }}</td>
          <td class="whitespace-nowrap px-3 py-2.5 tabular-nums" :title="row.doc.updatedAt">{{ row.facts.Updated?.value || '-' }}</td>
          <td v-if="canFavourite" class="px-2 py-2" @click.stop>
            <FavouriteStar :favourite="isFavourite(row.doc.ulid)" :busy="busy.has(row.doc.ulid)" @toggle="emit('toggle-favourite', row.doc.ulid)" />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
