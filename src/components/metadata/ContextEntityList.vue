<script setup lang="ts">
import { computed } from 'vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { Pencil, Trash2 } from '@lucide/vue'
import { roleLabel, type ContextEntity, type RootRole } from '@/lib/crate/build'

const props = defineProps<{
  rootName: string
  entities: ContextEntity[]
}>()
const emit = defineEmits<{
  (e: 'edit', entity: ContextEntity): void
  (e: 'remove', id: string): void
}>()

interface EntityGroup {
  role: RootRole | 'other'
  entities: ContextEntity[]
}

const groups = computed<EntityGroup[]>(() => {
  const grouped = new Map<RootRole | 'other', ContextEntity[]>()
  for (const entity of props.entities) {
    const roles = entity.roles.length ? entity.roles : ['other' as const]
    for (const role of roles) grouped.set(role, [...(grouped.get(role) ?? []), entity])
  }
  return [...grouped.entries()].map(([role, entities]) => ({ role, entities }))
})

function entityName(entity: ContextEntity): string {
  const name = entity.properties.name
  return typeof name === 'string' && name.trim() ? name : entity.id
}

function entityType(entity: ContextEntity): string {
  return Array.isArray(entity.type) ? entity.type.join(', ') : entity.type
}
</script>

<template>
  <div class="space-y-4">
    <div class="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
      <p class="text-[10px] font-semibold uppercase tracking-wider text-primary">This dataset</p>
      <p class="mt-1 text-sm font-medium text-foreground">{{ rootName || 'Untitled dataset' }}</p>
      <p class="font-mono text-[11px] text-muted-foreground">./</p>
    </div>

    <EmptyState v-if="!entities.length" compact title="Nothing referenced yet." />

    <section v-for="group in groups" :key="group.role" class="space-y-2">
      <h3 class="text-xs font-semibold text-foreground">{{ roleLabel(String(group.role)) }}</h3>
      <div
        v-for="entity in group.entities"
        :key="`${group.role}:${entity.id}`"
        class="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
      >
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="truncate text-sm font-medium text-foreground">{{ entityName(entity) }}</span>
            <Badge variant="secondary">{{ entityType(entity) }}</Badge>
          </div>
          <p class="truncate font-mono text-[11px] text-muted-foreground" :title="entity.id">{{ entity.id }}</p>
        </div>
        <Button variant="ghost" size="icon-sm" :aria-label="`Edit ${entityName(entity)}`" @click="emit('edit', entity)">
          <Pencil class="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon-sm" :aria-label="`Remove ${entityName(entity)}`" @click="emit('remove', entity.id)">
          <Trash2 class="h-3.5 w-3.5" />
        </Button>
      </div>
    </section>
  </div>
</template>
