<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import { templateForRole } from '@/lib/crate/entityTemplates'
import type { ContextEntity, RootRole } from '@/lib/crate/build'
import { Plus, X } from '@lucide/vue'

// One root property (Authors, Publisher, ...) as chips over the context
// entities carrying that role. Removing a chip drops the role, not the entity.
const props = defineProps<{
  label: string
  role: RootRole
  entities: ContextEntity[]
  hint?: string
}>()
const emit = defineEmits<{
  (e: 'add', role: RootRole): void
  (e: 'select', role: RootRole, entity: ContextEntity): void
  (e: 'remove', role: RootRole, entity: ContextEntity): void
}>()

const picking = ref(false)
const template = computed(() => templateForRole(props.role))

function typeNames(entity: ContextEntity): string[] {
  const types = Array.isArray(entity.type) ? entity.type : [entity.type]
  return types.map((type) => String(type).split('/').pop() ?? '')
}

function entityName(entity: ContextEntity): string {
  const name = entity.properties.name
  return typeof name === 'string' && name.trim() ? name : entity.id
}

const assigned = computed(() => props.entities.filter((entity) => entity.roles.includes(props.role)))
const candidates = computed(() => props.entities.filter((entity) => {
  if (entity.roles.includes(props.role)) return false
  const expected = template.value?.type
  return !expected || typeNames(entity).includes(expected)
}))

function choose(entity: ContextEntity) {
  picking.value = false
  emit('select', props.role, entity)
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <label class="text-xs font-medium text-foreground">{{ label }}</label>
      <div class="flex items-center gap-2">
        <slot name="action" />
        <Button variant="link" size="sm" class="h-auto p-0 text-xs" @click="emit('add', role)">
          <Plus class="h-3.5 w-3.5" /> Add
        </Button>
        <Button
          v-if="candidates.length"
          variant="link"
          size="sm"
          class="h-auto p-0 text-xs"
          :aria-expanded="picking"
          @click="picking = !picking"
        >Choose existing</Button>
      </div>
    </div>

    <div v-if="assigned.length" class="mt-1.5 flex flex-wrap gap-1.5">
      <span
        v-for="entity in assigned"
        :key="entity.id"
        class="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-2.5 pr-1"
      >
        <span class="truncate text-xs text-foreground" :title="entity.id">{{ entityName(entity) }}</span>
        <Badge variant="secondary">{{ typeNames(entity).join(', ') }}</Badge>
        <button
          type="button"
          class="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          :aria-label="`Remove ${entityName(entity)} from ${label}`"
          @click="emit('remove', role, entity)"
        >
          <X class="h-3 w-3" />
        </button>
      </span>
    </div>
    <p v-else class="mt-1.5 text-[11px] text-muted-foreground">{{ hint ?? 'None yet.' }}</p>

    <ul v-if="picking" role="listbox" class="mt-1.5 max-h-40 divide-y divide-border overflow-y-auto rounded-md border border-border">
      <li v-for="entity in candidates" :key="entity.id">
        <button
          type="button"
          role="option"
          :aria-selected="false"
          class="flex w-full items-baseline gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-muted/40"
          @click="choose(entity)"
        >
          <span class="min-w-0 truncate font-medium text-foreground">{{ entityName(entity) }}</span>
          <span class="shrink-0 text-[11px] text-muted-foreground">{{ typeNames(entity).join(', ') }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>
