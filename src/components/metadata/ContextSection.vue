<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import EntityFieldList from '@/components/metadata/EntityFieldList.vue'
import type { CommentEntry, PresentedEntity } from '@/lib/cratePresenter'
import type { EntityKind } from '@/lib/contextualEntities'
import { relativeTime } from '@/lib/utils'
import { AppWindow, BookOpen, MapPin, MessageSquare, Shapes, Tag } from '@lucide/vue'

// Every remaining contextual entity with all of its fields and values,
// profile-labeled and profile-ordered, plus the crate's comments.
const props = defineProps<{
  entities: PresentedEntity[]
  comments: CommentEntry[]
  highlightId?: string
}>()
const emit = defineEmits<{ (e: 'jump', id: string): void }>()

const BLOCK_CAP = 10
const expanded = ref(false)
const total = computed(() => props.entities.length + props.comments.length)
const visible = computed(() => (expanded.value ? props.entities : props.entities.slice(0, BLOCK_CAP)))

const KIND_ICONS: Partial<Record<EntityKind, Component>> = {
  publications: BookOpen,
  software: AppWindow,
  places: MapPin,
  terms: Tag,
}

function iconOf(kind: EntityKind): Component {
  return KIND_ICONS[kind] ?? Shapes
}

// A jump target hidden behind the cap expands the list before scrolling.
watch(
  () => props.highlightId,
  (id) => {
    if (id && props.entities.findIndex((entity) => entity.id === id) >= BLOCK_CAP) expanded.value = true
  },
)

// Malformed timestamps render verbatim instead of "NaNs ago".
function timeLabel(iso: string): string {
  return Number.isFinite(Date.parse(iso)) ? relativeTime(iso) : iso
}
</script>

<template>
  <section v-if="total" class="surface overflow-hidden">
    <div class="flex items-center gap-2 border-b border-border px-5 py-3.5 text-sm font-medium text-foreground">
      <Shapes class="h-4 w-4 text-primary" /> Context
      <span class="text-xs font-normal text-muted-foreground">{{ total }}</span>
    </div>

    <div class="divide-y divide-border">
      <div
        v-for="entity in visible"
        :id="`ctx-${entity.id}`"
        :key="entity.id"
        class="scroll-mt-4 px-5 py-4"
        :class="highlightId === entity.id ? 'ring-2 ring-inset ring-primary/40' : ''"
      >
        <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <component :is="iconOf(entity.kind)" class="h-4 w-4 shrink-0 text-primary/70" />
          <h3 class="min-w-0 truncate text-sm font-semibold text-foreground" :title="entity.id">{{ entity.name }}</h3>
          <Badge v-if="entity.profileLabel" variant="royal" class="text-[10px]">{{ entity.profileLabel }}</Badge>
          <span v-if="entity.types.length" class="font-mono text-[10px] text-muted-foreground/70">{{ entity.types.join(' · ') }}</span>
          <span v-if="entity.relations.length" class="ml-auto flex shrink-0 flex-wrap gap-1">
            <Badge v-for="relation in entity.relations" :key="relation" variant="outline" class="text-[10px] uppercase">{{ relation }}</Badge>
          </span>
        </div>

        <EntityFieldList v-if="entity.fields.length" class="mt-3" :fields="entity.fields" @jump="(id) => emit('jump', id)" />
        <p v-else-if="entity.unresolved" class="mt-2 text-xs italic text-muted-foreground">
          Referenced but not described in this crate.
        </p>
      </div>

      <div v-if="entities.length > BLOCK_CAP && !expanded" class="px-5 py-3">
        <Button variant="ghost" size="sm" @click="expanded = true">Show all {{ entities.length }}</Button>
      </div>

      <div v-if="comments.length" class="px-5 py-4">
        <div class="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
          <MessageSquare class="h-3.5 w-3.5 text-primary/60" />
          Comments
          <span>{{ comments.length }}</span>
        </div>
        <ul class="space-y-3">
          <li v-for="comment in comments" :key="comment.id" class="text-sm">
            <p class="whitespace-pre-wrap text-foreground/85">{{ comment.text }}</p>
            <p class="mt-1 text-xs text-muted-foreground">
              <span v-if="comment.authorName">{{ comment.authorName }}</span>
              <span v-if="comment.authorName && comment.created"> · </span>
              <span v-if="comment.created" :title="comment.created">{{ timeLabel(comment.created) }}</span>
            </p>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
