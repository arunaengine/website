<script setup lang="ts">
import { computed } from 'vue'
import Popover from '@/components/ui/Popover.vue'
import { issueCountsBySeverity, type IssueSeverity, type LiveIssue } from '@/lib/crate/editor'
import { CircleAlert, TriangleAlert } from '@lucide/vue'

const props = defineProps<{ issues: LiveIssue[] }>()

const KIND: Record<IssueSeverity, string> = { error: 'Requirement', warning: 'Recommendation' }

const blocking = computed(() => props.issues.some((issue) => issue.severity === 'error'))
const label = computed(() => {
  const counts = issueCountsBySeverity(props.issues)
  const parts: string[] = []
  if (counts.error) parts.push(`${counts.error} ${counts.error === 1 ? 'requirement' : 'requirements'} missing`)
  if (counts.warning) parts.push(`${counts.warning} ${counts.warning === 1 ? 'recommendation' : 'recommendations'} open`)
  return parts.join(', ')
})
</script>

<template>
  <Popover v-if="issues.length" align="end">
    <button
      type="button"
      class="inline-flex h-8 w-8 items-center justify-center rounded-md"
      :class="blocking ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'"
      :aria-label="label"
    >
      <CircleAlert v-if="blocking" class="h-4 w-4" />
      <TriangleAlert v-else class="h-4 w-4" />
    </button>
    <template #content>
      <ul class="space-y-1.5">
        <li v-for="issue in issues" :key="issue.key" class="text-xs text-muted-foreground">
          {{ KIND[issue.severity] }}: {{ issue.message }}
        </li>
      </ul>
    </template>
  </Popover>
</template>
