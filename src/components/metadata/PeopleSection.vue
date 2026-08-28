<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import ContextualEntityCard from '@/components/metadata/ContextualEntityCard.vue'
import type { ContextualEntity } from '@/lib/contextualEntities'
import { Building2, Users } from '@lucide/vue'

// People and organizations the crate describes beyond the hero's author chips.
const props = defineProps<{
  people: ContextualEntity[]
  organizations: ContextualEntity[]
  highlightId?: string
}>()
const emit = defineEmits<{ (e: 'jump', id: string): void }>()

const CARD_CAP = 8
const expanded = ref<Record<string, boolean>>({})
const total = computed(() => props.people.length + props.organizations.length)

const groups = computed(() =>
  [
    { key: 'people', label: 'People', icon: Users, entities: props.people },
    { key: 'organizations', label: 'Organizations', icon: Building2, entities: props.organizations },
  ].filter((group) => group.entities.length),
)

function cardsOf(group: { key: string; entities: ContextualEntity[] }): ContextualEntity[] {
  return expanded.value[group.key] ? group.entities : group.entities.slice(0, CARD_CAP)
}

// A jump target hidden behind the cap expands its group before scrolling.
watch(
  () => props.highlightId,
  (id) => {
    if (!id) return
    for (const group of groups.value) {
      const index = group.entities.findIndex((entity) => entity.id === id)
      if (index >= CARD_CAP) expanded.value = { ...expanded.value, [group.key]: true }
    }
  },
)
</script>

<template>
  <section v-if="total" class="surface overflow-hidden">
    <div class="flex items-center gap-2 border-b border-border px-5 py-3.5 text-sm font-medium text-foreground">
      <Users class="h-4 w-4 text-primary" /> People and organizations
      <span class="text-xs font-normal text-muted-foreground">{{ total }}</span>
    </div>

    <div class="space-y-4 px-5 py-4">
      <div v-for="group in groups" :key="group.key">
        <h3 class="mb-2 flex items-center gap-1.5 font-display text-sm font-semibold text-aruna-navy">
          <component :is="group.icon" class="h-3.5 w-3.5 text-primary/60" />
          {{ group.label }}
          <span class="text-xs font-normal text-muted-foreground">{{ group.entities.length }}</span>
        </h3>
        <div class="grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <ContextualEntityCard
            v-for="entity in cardsOf(group)"
            :key="entity.id"
            :entity="entity"
            :kind="group.key === 'people' ? 'people' : 'organizations'"
            :highlight="highlightId === entity.id"
            @jump="(id) => emit('jump', id)"
          />
        </div>
        <Button
          v-if="group.entities.length > CARD_CAP && !expanded[group.key]"
          variant="ghost"
          size="sm"
          class="mt-2"
          @click="expanded = { ...expanded, [group.key]: true }"
        >
          Show all {{ group.entities.length }}
        </Button>
      </div>
    </div>
  </section>
</template>
