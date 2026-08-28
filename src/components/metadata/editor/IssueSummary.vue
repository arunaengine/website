<script setup lang="ts">
import { computed } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import { issueCountsBySeverity, type LiveIssue } from '@/lib/crate/editor'

const props = defineProps<{ issues: LiveIssue[] }>()
const emit = defineEmits<{ (e: 'jump', entityId: string): void }>()

const LIMIT = 10

const counts = computed(() => issueCountsBySeverity(props.issues))
// Errors first: they are the ones a reader is most likely to act on.
const sorted = computed(() => [...props.issues].sort((a, b) =>
  (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1)))
const shown = computed(() => sorted.value.slice(0, LIMIT))
const hidden = computed(() => sorted.value.length - shown.value.length)
</script>

<template>
  <section class="surface">
    <header class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
      <div>
        <h2 class="font-display text-sm font-semibold text-aruna-navy">Things to look at</h2>
        <p class="text-xs text-muted-foreground">Suggestions from this page. None of them stop you from saving.</p>
      </div>
      <div class="flex items-center gap-2">
        <Badge v-if="counts.error" variant="destructive">{{ counts.error }} to fix</Badge>
        <Badge v-if="counts.warning" variant="warn">{{ counts.warning }} to consider</Badge>
        <Badge v-if="!issues.length" variant="success">Nothing outstanding</Badge>
      </div>
    </header>
    <ul v-if="issues.length" class="divide-y divide-border">
      <li v-for="issue in shown" :key="issue.key" class="flex items-center gap-3 px-5 py-2.5">
        <Badge :variant="issue.severity === 'error' ? 'destructive' : 'warn'" size="sm">
          {{ issue.severity === 'error' ? 'Fix' : 'Consider' }}
        </Badge>
        <span class="min-w-0 flex-1 text-xs text-muted-foreground">{{ issue.message }}</span>
        <Button variant="ghost" size="sm" @click="emit('jump', issue.entityId)">Open</Button>
      </li>
      <li v-if="hidden > 0" class="px-5 py-2.5 text-xs text-muted-foreground">And {{ hidden }} more.</li>
    </ul>
  </section>
</template>
