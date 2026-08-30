<script setup lang="ts">
import { computed, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import {
  displayName,
  entityName,
  findEntity,
  rootId,
  type CrateDraft,
  type LiveIssue,
} from '@/lib/crate/editor'
import type { CheckIssue } from '@/lib/crate/issues'
import { ChevronDown, ChevronUp } from '@lucide/vue'

// Everything outstanding in one place: the editor's own advisory checks and
// what the node answered (a rejected preview or write), each with a jump.
const props = defineProps<{ draft: CrateDraft; issues: LiveIssue[]; nodeIssues?: CheckIssue[] }>()
const emit = defineEmits<{ (e: 'jump', entityId: string): void }>()

type Tone = 'error' | 'warning' | 'rejected' | 'advisory'

interface Entry {
  key: string
  entityId: string
  tone: Tone
  message: string
  detail?: string
}

const TONE_LABEL: Record<Tone, string> = {
  error: 'Fix',
  warning: 'Consider',
  rejected: 'Node',
  advisory: 'Advisory',
}
const TONE_VARIANT = {
  error: 'destructive',
  warning: 'warn',
  rejected: 'destructive',
  advisory: 'secondary',
} as const

const expanded = ref(false)

const entries = computed<Entry[]>(() => [
  ...props.issues.map((issue) => ({
    key: issue.key,
    entityId: issue.entityId,
    tone: issue.severity,
    message: issue.message,
  })),
  ...(props.nodeIssues ?? []).map((issue) => ({
    key: issue.key,
    entityId: issue.entityId,
    tone: issue.severity === 'violation' ? ('rejected' as const) : ('advisory' as const),
    message: issue.message,
    detail: [issue.code, issue.path].filter(Boolean).join(' · '),
  })),
])

const counts = computed(() => {
  const count = (tone: Tone) => entries.value.filter((entry) => entry.tone === tone).length
  return { error: count('error'), warning: count('warning'), rejected: count('rejected'), advisory: count('advisory') }
})
const summary = computed(() => {
  const total = entries.value.length
  if (!total) return 'Nothing outstanding'
  return total === 1 ? '1 problem' : `${total} problems`
})

const groups = computed(() => {
  const grouped = new Map<string, Entry[]>()
  for (const entry of entries.value) {
    grouped.set(entry.entityId, [...(grouped.get(entry.entityId) ?? []), entry])
  }
  return [...grouped.entries()].map(([entityId, list]) => ({
    entityId,
    name: entityId === rootId(props.draft)
      ? entityName(props.draft.entities[0]) || 'This dataset'
      : displayName(findEntity(props.draft, entityId)) || entityId,
    entries: list,
  }))
})

function jump(entityId: string) {
  expanded.value = false
  emit('jump', entityId)
}
</script>

<template>
  <!-- The mobile bottom bar owns the last 5rem of the viewport, as main's pb-20 does. -->
  <section class="sticky bottom-20 z-20 border-t border-border bg-background/95 backdrop-blur md:bottom-0">
    <div v-if="expanded" class="container max-h-48 overflow-y-auto py-3 md:max-h-64">
      <div v-for="group in groups" :key="group.entityId" class="border-b border-border py-2 last:border-0">
        <div class="flex items-center gap-3">
          <p class="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{{ group.name }}</p>
          <Button variant="ghost" size="sm" @click="jump(group.entityId)">Open</Button>
        </div>
        <ul class="mt-1 space-y-1">
          <li v-for="entry in group.entries" :key="entry.key" class="flex items-start gap-2">
            <Badge :variant="TONE_VARIANT[entry.tone]" size="sm" class="mt-0.5 shrink-0">{{ TONE_LABEL[entry.tone] }}</Badge>
            <span class="min-w-0 flex-1 text-xs text-muted-foreground">
              {{ entry.message }}
              <span v-if="entry.detail" class="ml-1 font-mono text-[10px]">{{ entry.detail }}</span>
            </span>
          </li>
        </ul>
      </div>
    </div>

    <div class="container flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
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
      <Badge v-if="counts.rejected" variant="destructive" size="sm">{{ counts.rejected }} rejected by the node</Badge>
      <Badge v-if="counts.error" variant="destructive" size="sm">{{ counts.error }} to fix</Badge>
      <Badge v-if="counts.warning" variant="warn" size="sm">{{ counts.warning }} to consider</Badge>
      <Badge v-if="counts.advisory" variant="secondary" size="sm">{{ counts.advisory }} advisory</Badge>
      <Badge v-if="!entries.length" variant="success" size="sm">Nothing outstanding</Badge>
    </div>
  </section>
</template>
