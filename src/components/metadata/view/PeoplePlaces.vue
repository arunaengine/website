<script setup lang="ts">
// People and organizations grouped by their role in the dataset, then the places it names.
// `part` shows only one of the two, so the page can set them side by side.
import { computed } from 'vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import NameGrid from '@/components/metadata/view/NameGrid.vue'
import type { DatasetViewState } from '@/composables/useDatasetView'
import { Building2, MapPin, User, Users } from '@lucide/vue'

const props = defineProps<{ state: DatasetViewState; part?: 'people' | 'places' }>()
const emit = defineEmits<{ (e: 'open', id: string): void }>()
const { presentation } = props.state

const roles = computed(() => {
  const groups = new Map<string, Array<{ id: string; name: string; icon: typeof User }>>()
  const add = (entity: { id: string; name: string; roles: string[] }, icon: typeof User) => {
    const role = entity.roles[0] ?? 'Other'
    const list = groups.get(role) ?? []
    list.push({ id: entity.id, name: entity.name, icon })
    groups.set(role, list)
  }
  presentation.value.people.forEach((entity) => add(entity, User))
  presentation.value.organizations.forEach((entity) => add(entity, Building2))
  return [...groups.entries()].sort(([a], [b]) => (a === 'Other' ? 1 : b === 'Other' ? -1 : 0))
})
const peopleCount = computed(() => presentation.value.people.length + presentation.value.organizations.length)
const places = computed(() =>
  presentation.value.entities.filter((entity) => entity.kind === 'places').map((entity) => ({ id: entity.id, name: entity.name, icon: MapPin })),
)
</script>

<template>
  <section v-if="peopleCount && part !== 'places'" aria-labelledby="people-heading">
    <SectionHeading id="people-heading" title="People and organizations" :icon="Users" :count="String(peopleCount)" />
    <div class="surface space-y-5 p-5">
      <div v-for="[role, items] in roles" :key="role" class="grid gap-x-6 gap-y-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <p class="text-sm text-muted-foreground">{{ role }} <span class="tabular-nums">{{ items.length }}</span></p>
        <NameGrid :items="items" noun="people" @open="(id: string) => emit('open', id)" />
      </div>
    </div>
  </section>
  <section v-if="places.length && part !== 'people'" aria-labelledby="places-heading">
    <SectionHeading id="places-heading" title="Places" :icon="MapPin" :count="String(places.length)" />
    <div class="surface p-5"><NameGrid :items="places" noun="places" @open="(id: string) => emit('open', id)" /></div>
  </section>
</template>
