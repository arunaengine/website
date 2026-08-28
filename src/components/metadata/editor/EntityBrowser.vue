<script setup lang="ts">
import { computed, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import AddEntityDialog from './AddEntityDialog.vue'
import AddFilesDialog from './AddFilesDialog.vue'
import { entityIcon } from './icons'
import {
  displayName,
  entityGroup,
  partIds,
  typeLabel,
  type CrateDraft,
  type DraftEntity,
  type LiveIssue,
} from '@/lib/crate/editor'
import type { VocabIndex } from '@/lib/profiles/vocabulary'
import { Network, Plus, Upload } from '@lucide/vue'

const props = defineProps<{
  draft: CrateDraft
  vocab: VocabIndex | null
  selected: string
  issues: LiveIssue[]
  groupId?: string
}>()
const emit = defineEmits<{
  (e: 'select', entityId: string): void
  (e: 'update', draft: CrateDraft): void
  (e: 'graph'): void
}>()

const query = ref('')
const addOpen = ref(false)
const filesOpen = ref(false)

function iconFor(entity: DraftEntity) {
  return entityIcon(entity, entity.id === props.draft.entities[0]?.id)
}

function matches(entity: DraftEntity): boolean {
  const text = query.value.trim().toLowerCase()
  if (!text) return true
  return `${displayName(entity)} ${entity.id} ${entity.types.join(' ')}`.toLowerCase().includes(text)
}

const groups = computed(() => {
  const parts = partIds(props.draft)
  const buckets: Record<string, DraftEntity[]> = { root: [], data: [], contextual: [] }
  for (const entity of props.draft.entities) {
    if (matches(entity)) buckets[entityGroup(props.draft, entity, parts)].push(entity)
  }
  return [
    { key: 'root', title: 'This dataset', entities: buckets.root },
    { key: 'data', title: 'Files', entities: buckets.data },
    { key: 'contextual', title: 'Entities', entities: buckets.contextual },
  ].filter((group) => group.entities.length)
})

function countFor(entityId: string) {
  const own = props.issues.filter((issue) => issue.entityId === entityId)
  return { total: own.length, blocking: own.some((issue) => issue.severity === 'error') }
}
</script>

<template>
  <aside class="w-72 shrink-0">
    <div class="surface sticky top-4 flex max-h-[calc(100vh-7rem)] flex-col">
      <div class="space-y-2 border-b border-border p-3">
        <Input
          v-model="query"
          class="h-9"
          placeholder="Search this dataset"
          aria-label="Search entities"
        />
        <div class="flex flex-col gap-2">
          <Button variant="outline" size="sm" class="h-8 justify-start" @click="filesOpen = true">
            <Upload class="h-3.5 w-3.5" /> Add data entity
          </Button>
          <Button variant="outline" size="sm" class="h-8 justify-start" @click="addOpen = true">
            <Plus class="h-3.5 w-3.5" /> Add contextual entity
          </Button>
        </div>
        <Button variant="ghost" size="sm" class="h-8 w-full justify-start" @click="emit('graph')">
          <Network class="h-3.5 w-3.5" /> Graph
        </Button>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto">
        <section v-for="group in groups" :key="group.key">
          <p class="px-3 pb-1 pt-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {{ group.title }}
          </p>
          <ul>
            <li v-for="entity in group.entities" :key="entity.id">
              <button
                type="button"
                class="flex w-full items-center gap-2 px-3 py-2 text-left"
                :class="entity.id === selected ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/40'"
                :aria-current="entity.id === selected ? 'true' : undefined"
                @click="emit('select', entity.id)"
              >
                <component :is="iconFor(entity)" class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-xs font-medium">{{ displayName(entity) }}</span>
                  <span class="block truncate text-[11px] text-muted-foreground">
                    {{ entity.types.map(typeLabel).join(', ') }}
                  </span>
                </span>
                <Badge
                  v-if="countFor(entity.id).total"
                  :variant="countFor(entity.id).blocking ? 'destructive' : 'warn'"
                  size="sm"
                >
                  {{ countFor(entity.id).total }}
                </Badge>
              </button>
            </li>
          </ul>
        </section>
        <p v-if="!groups.length" class="px-3 py-6 text-center text-xs text-muted-foreground">
          Nothing here matches that search.
        </p>
      </div>
    </div>

    <AddEntityDialog
      v-if="addOpen"
      :open="addOpen"
      :draft="draft"
      :vocab="vocab"
      exclude-data
      offer-link
      @update:open="(value) => (addOpen = value)"
      @created="(created) => { emit('update', created.draft); emit('select', created.entity.id) }"
    />
    <AddFilesDialog
      v-if="filesOpen"
      :open="filesOpen"
      :draft="draft"
      :group-id="groupId"
      @update:open="(value) => (filesOpen = value)"
      @update="(next) => emit('update', next)"
    />
  </aside>
</template>
