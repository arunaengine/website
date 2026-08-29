<script setup lang="ts">
// A dataset the assistant asked to show: the root's name and description,
// what it contains and who is described in it, with a link to the page.
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import { presentCrate } from '@/lib/cratePresenter'
import { crateGraph, crateRootId, dataEntitiesOf, stringProp, typesOf } from '@/lib/dataEntities'
import { Package } from '@lucide/vue'

const props = defineProps<{ title: string; crate: unknown; documentId?: string }>()

const PART_CAP = 6
const ENTITY_CAP = 8

const root = computed(() => {
  const graph = crateGraph(props.crate)
  const rootId = crateRootId(props.crate)
  return graph.find((entity) => entity['@id'] === rootId) ?? graph.find((entity) => entity['@id'] === './')
})
const description = computed(() => stringProp(root.value?.description) ?? '')
const types = computed(() => typesOf(root.value))
const parts = computed(() => dataEntitiesOf(props.crate))
const presentation = computed(() => presentCrate(props.crate))
const people = computed(() => [...presentation.value.people, ...presentation.value.organizations])
const entities = computed(() => presentation.value.entities)
</script>

<template>
  <div class="surface-inline overflow-hidden text-xs">
    <div class="flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5">
      <Package class="h-3.5 w-3.5 shrink-0 text-primary" />
      <span class="min-w-0 flex-1 truncate font-medium text-foreground">{{ title }}</span>
      <Badge v-for="type in types" :key="type" size="sm" variant="secondary">{{ type }}</Badge>
    </div>
    <div class="space-y-2.5 px-3 py-2.5">
      <p v-if="description" class="line-clamp-4 leading-relaxed text-foreground/85">{{ description }}</p>
      <p v-else class="text-muted-foreground">No description.</p>

      <div v-if="parts.length">
        <p class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {{ parts.length }} {{ parts.length === 1 ? 'part' : 'parts' }}
        </p>
        <ul class="mt-1 space-y-0.5">
          <li v-for="part in parts.slice(0, PART_CAP)" :key="part.id" class="truncate font-mono text-[11px] text-foreground/80" :title="part.id">
            {{ part.name || part.id }}
          </li>
          <li v-if="parts.length > PART_CAP" class="text-muted-foreground">and {{ parts.length - PART_CAP }} more</li>
        </ul>
      </div>

      <div v-if="people.length || entities.length">
        <p class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Described entities</p>
        <div class="mt-1 flex flex-wrap gap-1">
          <span v-for="entity in people.slice(0, ENTITY_CAP)" :key="entity.id" class="chip" :title="entity.id">
            {{ entity.name }}
          </span>
          <span v-for="entity in entities.slice(0, Math.max(0, ENTITY_CAP - people.length))" :key="entity.id" class="chip" :title="entity.id">
            {{ entity.name }}
            <span class="text-[10px] text-muted-foreground/80">{{ entity.types[0] }}</span>
          </span>
        </div>
      </div>

      <RouterLink
        v-if="documentId"
        :to="{ name: 'dataset', params: { id: documentId } }"
        class="inline-block font-medium text-primary hover:underline"
      >
        Open the dataset
      </RouterLink>
    </div>
  </div>
</template>
