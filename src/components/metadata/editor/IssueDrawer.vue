<script setup lang="ts">
import { computed, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import {
  displayName,
  entityName,
  findEntity,
  issueCountsBySeverity,
  rootId,
  type CrateDraft,
  type LiveIssue,
} from '@/lib/crate/editor'
import { ChevronDown, ChevronUp } from '@lucide/vue'

const props = defineProps<{ draft: CrateDraft; issues: LiveIssue[] }>()
const emit = defineEmits<{ (e: 'jump', entityId: string): void }>()

const expanded = ref(false)

const counts = computed(() => issueCountsBySeverity(props.issues))
const summary = computed(() => {
  if (!props.issues.length) return 'Nothing outstanding'
  return props.issues.length === 1 ? '1 problem' : `${props.issues.length} problems`
})

const groups = computed(() => {
  const grouped = new Map<string, LiveIssue[]>()
  for (const issue of props.issues) {
    grouped.set(issue.entityId, [...(grouped.get(issue.entityId) ?? []), issue])
  }
  return [...grouped.entries()].map(([entityId, entries]) => ({
    entityId,
    name: entityId === rootId(props.draft)
      ? entityName(props.draft.entities[0]) || 'This dataset'
      : displayName(findEntity(props.draft, entityId)) || entityId,
    entries,
  }))
})

function jump(entityId: string) {
  expanded.value = false
  emit('jump', entityId)
}
</script>

<template>
  <section class="sticky bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur">
    <div v-if="expanded" class="container max-h-64 overflow-y-auto py-3">
      <div v-for="group in groups" :key="group.entityId" class="border-b border-border py-2 last:border-0">
        <div class="flex items-center gap-3">
          <p class="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{{ group.name }}</p>
          <Button variant="ghost" size="sm" class="h-8" @click="jump(group.entityId)">Open</Button>
        </div>
        <ul class="mt-1 space-y-1">
          <li v-for="issue in group.entries" :key="issue.key" class="flex items-start gap-2">
            <Badge :variant="issue.severity === 'error' ? 'destructive' : 'warn'" size="sm">
              {{ issue.severity === 'error' ? 'Fix' : 'Consider' }}
            </Badge>
            <span class="min-w-0 flex-1 text-xs text-muted-foreground">{{ issue.message }}</span>
          </li>
        </ul>
      </div>
    </div>

    <div class="container flex items-center gap-3 py-2">
      <button
        type="button"
        class="flex flex-1 items-center gap-2 text-left text-xs font-medium text-foreground"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        <ChevronDown v-if="expanded" class="h-3.5 w-3.5" />
        <ChevronUp v-else class="h-3.5 w-3.5" />
        {{ summary }}
      </button>
      <Badge v-if="counts.error" variant="destructive" size="sm">{{ counts.error }} to fix</Badge>
      <Badge v-if="counts.warning" variant="warn" size="sm">{{ counts.warning }} to consider</Badge>
      <Badge v-if="!issues.length" variant="success" size="sm">Nothing outstanding</Badge>
    </div>
  </section>
</template>
