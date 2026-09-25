<script setup lang="ts">
// What a repository still needs from the dataset: violations block, warnings do not.
import { computed } from 'vue'
import type { ProfileValidationFinding } from '@/lib/api'
import { pathMembers } from '@/lib/shacl/mapFindings'
import { termNameFromUri } from '@/lib/profiles/uri'

const props = defineProps<{ findings: readonly ProfileValidationFinding[] }>()

const ordered = computed(() =>
  [...props.findings].sort((a, b) => Number(b.severity === 'violation') - Number(a.severity === 'violation')),
)

function field(finding: ProfileValidationFinding): string {
  const members = finding.path ? pathMembers(finding.path) : []
  return members.map(termNameFromUri).join(' or ')
}
</script>

<template>
  <ul v-if="ordered.length" class="space-y-1 text-xs">
    <li
      v-for="(finding, index) in ordered"
      :key="index"
      :class="finding.severity === 'violation' ? 'text-destructive' : finding.severity === 'warning' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'"
    >
      <span class="font-medium">{{ finding.severity === 'violation' ? 'Needed' : finding.severity === 'warning' ? 'Suggested' : 'Note' }}:</span>
      <span v-if="field(finding)" class="font-mono"> {{ field(finding) }}</span>
      {{ finding.message }}
    </li>
  </ul>
</template>
