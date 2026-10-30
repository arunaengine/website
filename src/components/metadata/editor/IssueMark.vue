<script setup lang="ts">
import type { IssueSeverity, LiveIssue } from '@/lib/crate/editor'
import { CircleAlert, TriangleAlert } from '@lucide/vue'

// A field's open issues, written under it: red blocks the save, amber does not.
defineProps<{ issues: LiveIssue[] }>()

const KIND: Record<IssueSeverity, string> = { error: 'Requirement', warning: 'Recommendation' }
</script>

<template>
  <ul v-if="issues.length" class="space-y-1">
    <li
      v-for="issue in issues"
      :key="issue.key"
      :data-issue="issue.key"
      class="flex scroll-mt-24 items-start gap-1.5 text-xs"
      :class="issue.severity === 'error' ? 'text-destructive' : 'text-amber-700 dark:text-amber-300'"
    >
      <CircleAlert v-if="issue.severity === 'error'" class="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <TriangleAlert v-else class="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span><span class="sr-only">{{ KIND[issue.severity] }}: </span>{{ issue.message }}</span>
    </li>
  </ul>
</template>
